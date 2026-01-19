import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export interface GLBLoadResult {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
    cameras: THREE.Camera[];
}

let dracoLoader: DRACOLoader | null = null;

function getDracoLoader(): DRACOLoader {
    if (!dracoLoader) {
        dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        dracoLoader.setDecoderConfig({ type: 'js' });
    }
    return dracoLoader;
}

export async function loadGLB(
    data: ArrayBuffer,
    onProgress?: (progress: number) => void
): Promise<GLBLoadResult> {
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.setDRACOLoader(getDracoLoader());

        loader.parse(
            data,
            '',
            (gltf) => {
                // Enable shadows for all meshes and fix texture settings
                gltf.scene.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;

                        // Ensure materials are properly configured
                        if (child.material) {
                            const materials = Array.isArray(child.material)
                                ? child.material
                                : [child.material];

                            materials.forEach((mat) => {
                                // Handle all PBR materials
                                if (mat instanceof THREE.MeshStandardMaterial ||
                                    mat instanceof THREE.MeshPhysicalMaterial) {

                                    mat.envMapIntensity = 1.0;

                                    // Ensure textures have correct colorSpace
                                    if (mat.map) {
                                        mat.map.colorSpace = THREE.SRGBColorSpace;
                                        mat.map.needsUpdate = true;
                                    }
                                    if ((mat as THREE.MeshStandardMaterial).emissiveMap) {
                                        (mat as THREE.MeshStandardMaterial).emissiveMap!.colorSpace = THREE.SRGBColorSpace;
                                    }

                                    // Ensure other maps use correct non-color settings
                                    if ((mat as THREE.MeshStandardMaterial).normalMap) {
                                        (mat as THREE.MeshStandardMaterial).normalMap!.colorSpace = THREE.NoColorSpace;
                                    }
                                    if ((mat as THREE.MeshStandardMaterial).roughnessMap) {
                                        (mat as THREE.MeshStandardMaterial).roughnessMap!.colorSpace = THREE.NoColorSpace;
                                    }
                                    if ((mat as THREE.MeshStandardMaterial).metalnessMap) {
                                        (mat as THREE.MeshStandardMaterial).metalnessMap!.colorSpace = THREE.NoColorSpace;
                                    }
                                    if ((mat as THREE.MeshStandardMaterial).aoMap) {
                                        (mat as THREE.MeshStandardMaterial).aoMap!.colorSpace = THREE.NoColorSpace;
                                    }

                                    mat.needsUpdate = true;
                                }
                            });
                        }
                    }
                });

                resolve({
                    scene: gltf.scene,
                    animations: gltf.animations,
                    cameras: gltf.cameras as THREE.Camera[],
                });
            },
            (error) => {
                reject(error);
            }
        );
    });
}

export async function loadGLBFromURL(
    url: string,
    onProgress?: (progress: number) => void
): Promise<GLBLoadResult> {
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.setDRACOLoader(getDracoLoader());

        loader.load(
            url,
            (gltf) => {
                gltf.scene.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                resolve({
                    scene: gltf.scene,
                    animations: gltf.animations,
                    cameras: gltf.cameras as THREE.Camera[],
                });
            },
            (xhr) => {
                if (onProgress && xhr.total > 0) {
                    onProgress((xhr.loaded / xhr.total) * 100);
                }
            },
            (error) => {
                reject(error);
            }
        );
    });
}
