import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

export interface PLYMeshResult {
    geometry: THREE.BufferGeometry;
    mesh: THREE.Mesh;
}

export async function loadPLYMesh(
    data: ArrayBuffer,
    options: {
        color?: THREE.ColorRepresentation;
        metalness?: number;
        roughness?: number;
        flatShading?: boolean;
    } = {}
): Promise<PLYMeshResult> {
    return new Promise((resolve, reject) => {
        try {
            const loader = new PLYLoader();
            const geometry = loader.parse(data);

            // Compute normals if not present
            if (!geometry.attributes.normal) {
                geometry.computeVertexNormals();
            }

            // Center geometry
            geometry.center();

            // Check if geometry has vertex colors
            const hasColors = geometry.attributes.color !== undefined;

            // Create material
            const material = new THREE.MeshStandardMaterial({
                color: hasColors ? 0xffffff : (options.color ?? 0x888888),
                metalness: options.metalness ?? 0.2,
                roughness: options.roughness ?? 0.8,
                flatShading: options.flatShading ?? false,
                vertexColors: hasColors,
                side: THREE.DoubleSide,
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            resolve({ geometry, mesh });
        } catch (error) {
            reject(error);
        }
    });
}

export async function loadPLYMeshFromURL(
    url: string,
    options: {
        color?: THREE.ColorRepresentation;
        metalness?: number;
        roughness?: number;
    } = {}
): Promise<PLYMeshResult> {
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    return loadPLYMesh(data, options);
}
