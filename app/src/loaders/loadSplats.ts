import * as THREE from 'three';

/**
 * Basic Gaussian Splat loader implementation
 * For full 3DGS rendering, we'll use a point cloud representation
 * with custom shaders for the splat effect.
 * 
 * Note: For production use, consider integrating "Spark" or "gsplat.js"
 */

export interface SplatData {
    positions: Float32Array;
    scales: Float32Array;
    rotations: Float32Array;
    colors: Float32Array;
    opacities: Float32Array;
    count: number;
}

export interface SplatLoadResult {
    object: THREE.Points;
    data: SplatData;
}

export async function loadSplats(
    data: ArrayBuffer,
    options: {
        pointSize?: number;
        maxPoints?: number;
    } = {}
): Promise<SplatLoadResult> {
    const splatData = parsePLYSplat(data, options.maxPoints);
    const object = createSplatPointCloud(splatData, options.pointSize ?? 0.01);

    return { object, data: splatData };
}

function parsePLYSplat(data: ArrayBuffer, maxPoints?: number): SplatData {
    const decoder = new TextDecoder('ascii');
    const uint8 = new Uint8Array(data);

    // Find end of header
    let headerEnd = 0;
    const headerText = decoder.decode(uint8.slice(0, 8192));
    const endHeaderMatch = headerText.match(/end_header\s*/);
    if (!endHeaderMatch) {
        throw new Error('Invalid PLY: no end_header found');
    }
    headerEnd = headerText.indexOf('end_header') + 'end_header'.length;
    while (uint8[headerEnd] === 10 || uint8[headerEnd] === 13) headerEnd++;

    // Parse header for properties
    const header = headerText.substring(0, headerText.indexOf('end_header'));
    const lines = header.split('\n');

    let vertexCount = 0;
    const properties: { name: string; type: string; offset: number }[] = [];
    let currentOffset = 0;
    let format = 'binary_little_endian';

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('format')) {
            if (trimmed.includes('ascii')) format = 'ascii';
            else if (trimmed.includes('binary_big_endian')) format = 'binary_big_endian';
        }

        if (trimmed.startsWith('element vertex')) {
            vertexCount = parseInt(trimmed.split(/\s+/)[2], 10);
        }

        if (trimmed.startsWith('property')) {
            const parts = trimmed.split(/\s+/);
            const type = parts[1];
            const name = parts[2];

            let size = 4; // default float size
            if (type === 'double') size = 8;
            else if (type === 'uchar' || type === 'char') size = 1;
            else if (type === 'short' || type === 'ushort') size = 2;

            properties.push({ name, type, offset: currentOffset });
            currentOffset += size;
        }
    }

    const bytesPerVertex = currentOffset;
    const actualCount = maxPoints ? Math.min(vertexCount, maxPoints) : vertexCount;

    // Initialize arrays
    const positions = new Float32Array(actualCount * 3);
    const scales = new Float32Array(actualCount * 3);
    const rotations = new Float32Array(actualCount * 4);
    const colors = new Float32Array(actualCount * 3);
    const opacities = new Float32Array(actualCount);

    // Create DataView for reading
    const dataView = new DataView(data, headerEnd);

    // Property name mappings
    const propIndices = new Map<string, number>();
    properties.forEach((p, i) => propIndices.set(p.name, i));

    const getFloat = (vertexOffset: number, propName: string): number => {
        const prop = properties.find(p => p.name === propName);
        if (!prop) return 0;
        return dataView.getFloat32(vertexOffset + prop.offset, true);
    };

    const getUchar = (vertexOffset: number, propName: string): number => {
        const prop = properties.find(p => p.name === propName);
        if (!prop) return 0;
        return dataView.getUint8(vertexOffset + prop.offset);
    };

    // Read vertex data
    for (let i = 0; i < actualCount; i++) {
        const offset = i * bytesPerVertex;

        // Position
        positions[i * 3 + 0] = getFloat(offset, 'x');
        positions[i * 3 + 1] = getFloat(offset, 'y');
        positions[i * 3 + 2] = getFloat(offset, 'z');

        // Scale (using exponential)
        scales[i * 3 + 0] = Math.exp(getFloat(offset, 'scale_0') || 0);
        scales[i * 3 + 1] = Math.exp(getFloat(offset, 'scale_1') || 0);
        scales[i * 3 + 2] = Math.exp(getFloat(offset, 'scale_2') || 0);

        // Rotation quaternion
        rotations[i * 4 + 0] = getFloat(offset, 'rot_0') || 1;
        rotations[i * 4 + 1] = getFloat(offset, 'rot_1') || 0;
        rotations[i * 4 + 2] = getFloat(offset, 'rot_2') || 0;
        rotations[i * 4 + 3] = getFloat(offset, 'rot_3') || 0;

        // Colors from spherical harmonics DC component (convert SH to RGB)
        const SH_C0 = 0.28209479177387814;
        const r = 0.5 + SH_C0 * getFloat(offset, 'f_dc_0');
        const g = 0.5 + SH_C0 * getFloat(offset, 'f_dc_1');
        const b = 0.5 + SH_C0 * getFloat(offset, 'f_dc_2');
        colors[i * 3 + 0] = Math.max(0, Math.min(1, r));
        colors[i * 3 + 1] = Math.max(0, Math.min(1, g));
        colors[i * 3 + 2] = Math.max(0, Math.min(1, b));

        // Opacity (sigmoid of raw value)
        const rawOpacity = getFloat(offset, 'opacity') || 0;
        opacities[i] = 1 / (1 + Math.exp(-rawOpacity));
    }

    return {
        positions,
        scales,
        rotations,
        colors,
        opacities,
        count: actualCount,
    };
}

function createSplatPointCloud(data: SplatData, pointSize: number): THREE.Points {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geometry.setAttribute('opacity', new THREE.BufferAttribute(data.opacities, 1));
    geometry.setAttribute('scale', new THREE.BufferAttribute(data.scales, 3));

    // Custom shader material for splat-like rendering
    const material = new THREE.ShaderMaterial({
        uniforms: {
            pointSize: { value: pointSize * 100 },
            viewport: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        },
        vertexShader: `
      attribute float opacity;
      attribute vec3 scale;
      
      varying vec3 vColor;
      varying float vOpacity;
      
      uniform float pointSize;
      uniform vec2 viewport;
      
      void main() {
        vColor = color;
        vOpacity = opacity;
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        
        // Scale point size based on distance and gaussian scale
        float avgScale = (scale.x + scale.y + scale.z) / 3.0;
        float size = pointSize * avgScale * (300.0 / -mvPosition.z);
        
        gl_PointSize = clamp(size, 1.0, 64.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
        fragmentShader: `
      varying vec3 vColor;
      varying float vOpacity;
      
      void main() {
        // Circular point with gaussian falloff
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        
        if (dist > 0.5) discard;
        
        // Gaussian falloff for soft splat appearance
        float alpha = exp(-dist * dist * 8.0) * vOpacity;
        
        if (alpha < 0.01) discard;
        
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;

    return points;
}

export async function loadSOG(
    data: ArrayBuffer,
    options: {
        pointSize?: number;
    } = {}
): Promise<SplatLoadResult> {
    // SOG format is a compressed gaussian splat format
    // For now, treat it similar to PLY splat (full implementation would need decompression)
    console.warn('SOG format support is limited - treating as compressed splat');

    // Basic SOG parsing would go here
    // For now, create a placeholder
    const splatData: SplatData = {
        positions: new Float32Array(0),
        scales: new Float32Array(0),
        rotations: new Float32Array(0),
        colors: new Float32Array(0),
        opacities: new Float32Array(0),
        count: 0,
    };

    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({ size: 0.01 });
    const object = new THREE.Points(geometry, material);

    return { object, data: splatData };
}
