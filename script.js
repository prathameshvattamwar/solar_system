import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import TWEEN from '@tweenjs/tween.js';

const scene = new THREE.Scene();
const container = document.getElementById('scene-container');
const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 3000);
camera.position.set(0, 70, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x000000);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 5;
controls.maxDistance = 1500;
controls.target.set(0, 0, 0);

const ambientLight = new THREE.AmbientLight(0x404040, 50); // Adjusted brightness
scene.add(ambientLight);
const pointLight = new THREE.PointLight(0xFFFFFF, 5.0, 0); // Adjusted brightness & range
pointLight.position.set(0, 0, 0);
scene.add(pointLight);


const solarSystemData = {
    sun:     { name: 'sun', size: 16, color: 0xFFCC33, position: 0, orbitSpeed: 0, rotationSpeed: 0.001, isEmissive: true },
    mercury: { name: 'mercury', size: 1, color: 0xAAAAAA, position: 32, orbitSpeed: 0.04, rotationSpeed: 0.002 },
    venus:   { name: 'venus', size: 2.5, color: 0xFFE082, position: 50, orbitSpeed: 0.015, rotationSpeed: 0.001 },
    earth:   {
        name: 'earth', size: 2.6, color: 0x6699FF, position: 72, orbitSpeed: 0.01, rotationSpeed: 0.01,
        moon: { name: 'moon', size: 0.7, color: 0xCCCCCC, position: 5, orbitSpeed: 0.05, rotationSpeed: 0.005 }
    },
    mars:    { name: 'mars', size: 1.5, color: 0xFF7F50, position: 98, orbitSpeed: 0.008, rotationSpeed: 0.011 },
    jupiter: { name: 'jupiter', size: 8, color: 0xD2B48C, position: 160, orbitSpeed: 0.002, rotationSpeed: 0.02 },
    saturn:  { name: 'saturn', size: 7, color: 0xF5F5DC, position: 220, orbitSpeed: 0.001, rotationSpeed: 0.018, ring: { innerRadius: 9, outerRadius: 14, color: 0xCCCCCC } },
    uranus:  { name: 'uranus', size: 5, color: 0xAFEEEE, position: 280, orbitSpeed: 0.0005, rotationSpeed: 0.015 },
    neptune: { name: 'neptune', size: 4.8, color: 0x3A5FCD, position: 340, orbitSpeed: 0.0002, rotationSpeed: 0.016 },
};

const celestialBodies = {};
const targetWorldPosition = new THREE.Vector3();

for (const key in solarSystemData) {
    const data = solarSystemData[key];

    const geometry = new THREE.SphereGeometry(data.size, 32, 32);
    let material;
    if (data.isEmissive) {
        material = new THREE.MeshBasicMaterial({ color: data.color });
    } else {
        material = new THREE.MeshStandardMaterial({
            color: data.color,
            roughness: 0.8,
            metalness: 0.1
        });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = data.name;

    const pivot = new THREE.Object3D();
    scene.add(pivot);
    pivot.add(mesh);

    celestialBodies[key] = { mesh: mesh, pivot: pivot, data: data };

    if (key !== 'sun') {
        mesh.position.set(data.position, 0, 0);

        const orbitGeometry = new THREE.BufferGeometry().setFromPoints(
            new THREE.Path().absarc(0, 0, data.position, 0, Math.PI * 2, false).getPoints(128)
        );
        const orbitMaterial = new THREE.LineBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.4 });
        const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
        orbitLine.rotation.x = Math.PI / 2;
        scene.add(orbitLine);
    }

    if (key === 'earth' && data.moon) {
        const moonData = data.moon;
        const moonGeo = new THREE.SphereGeometry(moonData.size, 16, 16);
        const moonMat = new THREE.MeshStandardMaterial({
            color: moonData.color,
            roughness: 0.9
        });
        const moonMesh = new THREE.Mesh(moonGeo, moonMat);
        moonMesh.name = moonData.name;

        const moonPivot = new THREE.Object3D();
        mesh.add(moonPivot);

        moonPivot.add(moonMesh);
        moonMesh.position.set(moonData.position, 0, 0);

        celestialBodies[key].moonPivot = moonPivot;
        celestialBodies[key].moonData = moonData;
    }

    if (data.ring) {
        const ringGeo = new THREE.RingGeometry(data.ring.innerRadius, data.ring.outerRadius, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: data.ring.color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 1.9;
        mesh.add(ringMesh);
    }
}

const navLinks = document.querySelectorAll('#planet-list a');
let activeTarget = null;
let isTransitioning = false;

navLinks.forEach(link => {
    link.addEventListener('click', (event) => {
        event.preventDefault();
        if (isTransitioning) return;

        const targetName = link.getAttribute('data-target');

        document.querySelector('#planet-list a.active')?.classList.remove('active');

        if (targetName === 'overview') {
            activeTarget = null;
            link.classList.add('active');
            smoothCameraTransition({ x: 0, y: 70, z: 200 }, { x: 0, y: 0, z: 0 });
            controls.maxDistance = 1500;
        } else {
            const targetBody = celestialBodies[targetName];
            if (targetBody) {
                activeTarget = targetBody;
                link.classList.add('active');
                focusCameraOnPlanet(targetBody);
                controls.maxDistance = targetBody.data.size * 50;
                controls.minDistance = targetBody.data.size * 1.5;
            }
        }
    });
});


function smoothCameraTransition(targetPosition, targetLookAt, duration = 1500) {
    isTransitioning = true;
    const cameraStart = camera.position.clone();
    const controlsTargetStart = controls.target.clone();

    new TWEEN.Tween({ t: 0 })
        .to({ t: 1 }, duration)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(({ t }) => {
            camera.position.lerpVectors(cameraStart, targetPosition, t);
            controls.target.lerpVectors(controlsTargetStart, targetLookAt, t);
            controls.update();
        })
        .onComplete(() => {
            isTransitioning = false;
             if (activeTarget) {
                activeTarget.mesh.getWorldPosition(controls.target);
            } else {
                controls.target.copy(targetLookAt);
            }
            controls.update();
        })
        .start();
}

function focusCameraOnPlanet(targetBody) {
    const targetMesh = targetBody.mesh;
    const targetData = targetBody.data;

    targetMesh.getWorldPosition(targetWorldPosition);

    const offsetMultiplier = targetData.size * 5 + 10;
    const cameraTargetPosition = new THREE.Vector3();

    const direction = targetWorldPosition.clone().normalize().multiplyScalar(-1);

    cameraTargetPosition.copy(targetWorldPosition).add(direction.multiplyScalar(offsetMultiplier));
    cameraTargetPosition.y += targetData.size * 1.5;

    smoothCameraTransition(cameraTargetPosition, targetWorldPosition);
}

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    TWEEN.update();

    for (const key in celestialBodies) {
        const body = celestialBodies[key];
        body.mesh.rotation.y += body.data.rotationSpeed;
        if (body.pivot) {
             body.pivot.rotation.y += body.data.orbitSpeed;
        }

        if (body.moonPivot) {
            body.moonPivot.rotation.y += body.moonData.orbitSpeed;
            body.moonPivot.children[0].rotation.y += body.moonData.rotationSpeed;
        }
    }

    if (activeTarget && !isTransitioning) {
        activeTarget.mesh.getWorldPosition(targetWorldPosition);
        controls.target.copy(targetWorldPosition);
    }

    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
}
window.addEventListener('resize', onWindowResize);

document.querySelector('#planet-list a[data-target="overview"]').classList.add('active');
animate();