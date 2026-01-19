import * as THREE from 'three';
import { loadGLB, type GLBLoadResult } from './loadGLB';
import { loadPLYMesh, type PLYMeshResult } from './loadPLYMesh';
import { loadSplats, loadSOG, type SplatLoadResult } from './loadSplats';
import { isPLYSplat } from './detectPLYType';

export type FileType = 'glb' | 'gltf' | 'ply-mesh' | 'ply-splat' | 'sog' | 'unknown';

export interface LoadResult {
    type: FileType;
    object: THREE.Object3D;
    animations?: THREE.AnimationClip[];
    cameras?: THREE.Camera[];
}

export function detectFileType(filename: string, data?: ArrayBuffer): FileType {
    const ext = filename.toLowerCase().split('.').pop() || '';

    switch (ext) {
        case 'glb':
            return 'glb';
        case 'gltf':
            return 'gltf';
        case 'sog':
            return 'sog';
        case 'ply':
            if (data) {
                return isPLYSplat(data) ? 'ply-splat' : 'ply-mesh';
            }
            return 'ply-mesh'; // Default to mesh if no data available
        default:
            return 'unknown';
    }
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
