import * as THREE from 'three';

export interface CameraConfig {
    fov: number;
    near: number;
    far: number;
    position: THREE.Vector3;
}

export const defaultCameraConfig: CameraConfig = {
    fov: 45,
    near: 0.01,
    far: 100000,
    position: new THREE.Vector3(3, 3, 5),
};

export class ViewerCamera {
    public camera: THREE.PerspectiveCamera;
    private defaultPosition: THREE.Vector3;
    private defaultTarget: THREE.Vector3;

    constructor(aspect: number, config: Partial<CameraConfig> = {}) {
        const finalConfig = { ...defaultCameraConfig, ...config };

        this.camera = new THREE.PerspectiveCamera(
            finalConfig.fov,
            aspect,
            finalConfig.near,
            finalConfig.far
        );

        this.camera.position.copy(finalConfig.position);
        this.defaultPosition = finalConfig.position.clone();
        this.defaultTarget = new THREE.Vector3(0, 0, 0);
    }

    public updateAspect(width: number, height: number): void {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    public fitToObject(
        object: THREE.Object3D,
        offset: number = 1.5
    ): { center: THREE.Vector3; distance: number } {
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let distance = maxDim / (2 * Math.tan(fov / 2));
        distance *= offset;

        // Position camera to look at center from a good angle
        const direction = new THREE.Vector3(1, 0.5, 1).normalize();
        this.camera.position.copy(center).add(direction.multiplyScalar(distance));
        this.camera.lookAt(center);

        // Dynamically adjust near/far planes based on model size
        const modelRadius = maxDim * 2;
        this.camera.near = Math.max(0.01, distance * 0.001);
        this.camera.far = Math.max(distance * 10, modelRadius * 10);
        this.camera.updateProjectionMatrix();

        console.log('📷 Camera adjusted:', {
            position: this.camera.position.toArray(),
            near: this.camera.near,
            far: this.camera.far,
            distance
        });

        return { center, distance };
    }

    public reset(): void {
        this.camera.position.copy(this.defaultPosition);
        this.camera.lookAt(this.defaultTarget);
        this.camera.near = 0.01;
        this.camera.far = 100000;
        this.camera.updateProjectionMatrix();
    }

    public setPresetView(preset: 'front' | 'top' | 'left' | 'right' | 'back' | 'isometric', distance: number = 5): void {
        const presets: Record<string, THREE.Vector3> = {
            front: new THREE.Vector3(0, 0, distance),
            back: new THREE.Vector3(0, 0, -distance),
            top: new THREE.Vector3(0, distance, 0.001),
            left: new THREE.Vector3(-distance, 0, 0),
            right: new THREE.Vector3(distance, 0, 0),
            isometric: new THREE.Vector3(distance * 0.7, distance * 0.7, distance * 0.7),
        };

        const pos = presets[preset];
        if (pos) {
            this.camera.position.copy(pos);
        }
    }
}
