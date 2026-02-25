import * as THREE from 'three';
import { loadGLB, type GLBLoadResult } from './loadGLB';
import { loadPLYMesh, type PLYMeshResult } from './loadPLYMesh';
import { loadSplats, loadSOG, type SplatLoadResult } from './loadSplats';
import { isPLYSplat } from './detectPLYType';

export type FileType = 'glb' | 'gltf' | 'ply-mesh' | 'ply-splat' | 'sog' | 'lut' | 'unknown';

export interface LoadResult {
    type: FileType;
    object?: THREE.Object3D;
    animations?: THREE.AnimationClip[];
    cameras?: THREE.Camera[];
    lutTexture?: THREE.DataTexture | THREE.Data3DTexture;
}

export function detectFileType(filename: string, data?: ArrayBuffer): FileType {
    const ext = filename.toLowerCase().split('.').pop() || '';

    if (ext === 'glb') return 'glb';
    if (ext === 'gltf') return 'gltf';
    if (ext === 'sog') return 'sog';
    if (ext === 'cube' || ext === '3dl') return 'lut';
    if (ext === 'ply') {
        if (data) {
            return isPLYSplat(data) ? 'ply-splat' : 'ply-mesh';
        }
        return 'ply-mesh';
    }
    return 'unknown';
}

export async function loadAny(
    data: ArrayBuffer,
    filename: string,
    onProgress?: (progress: number) => void
): Promise<LoadResult> {
    const type = detectFileType(filename, data);

    switch (type) {
        case 'glb':
        case 'gltf': {
            const result: GLBLoadResult = await loadGLB(data, onProgress);
            return {
                type,
                object: result.scene,
                animations: result.animations,
                cameras: result.cameras,
            };
        }

        case 'ply-mesh': {
            const result: PLYMeshResult = await loadPLYMesh(data);
            return {
                type,
                object: result.mesh,
            };
        }

        case 'ply-splat': {
            const result: SplatLoadResult = await loadSplats(data);
            return {
                type,
                object: result.object,
            };
        }

        case 'sog': {
            const result: SplatLoadResult = await loadSOG(data);
            return {
                type,
                object: result.object,
            };
        }

        case 'lut': {
            // Dynamically import loaders to keep initial bundle smaller
            const { LUTCubeLoader } = await import('three/examples/jsm/loaders/LUTCubeLoader.js');
            const { LUT3dlLoader } = await import('three/examples/jsm/loaders/LUT3dlLoader.js');

            const blob = new Blob([data]);
            const url = URL.createObjectURL(blob);

            return new Promise((resolve, reject) => {
                const ext = filename.toLowerCase().split('.').pop() || '';
                const loader = ext === 'cube' ? new LUTCubeLoader() : new LUT3dlLoader();

                loader.load(url, (result) => {
                    URL.revokeObjectURL(url);
                    resolve({
                        type,
                        lutTexture: result.texture3D
                    });
                }, undefined, (err: unknown) => {
                    URL.revokeObjectURL(url);
                    reject(err);
                });
            });
        }

        default:
            throw new Error(`Unsupported file type: ${filename}`);
    }
}

export async function loadFromFile(
    file: File,
    onProgress?: (progress: number) => void
): Promise<LoadResult> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const data = event.target?.result as ArrayBuffer;
                const result = await loadAny(data, file.name, onProgress);
                resolve(result);
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => reject(new Error('Failed to read file'));

        reader.onprogress = (event) => {
            if (onProgress && event.total > 0) {
                onProgress((event.loaded / event.total) * 100);
            }
        };

        reader.readAsArrayBuffer(file);
    });
}

export async function loadFromURL(
    url: string,
    onProgress?: (progress: number) => void
): Promise<LoadResult> {
    const response = await fetch(url);
    const data = await response.arrayBuffer();

    // Extract filename from URL
    const urlParts = url.split('/');
    const filename = urlParts[urlParts.length - 1].split('?')[0];

    return loadAny(data, filename, onProgress);
}
