/**
 * Detect whether a PLY file is a regular mesh or a 3D Gaussian Splat.
 * Gaussian splat PLY files contain specific vertex properties like:
 * - f_dc_* (spherical harmonics DC component)
 * - opacity
 * - scale_* (gaussian scale)
 * - rot_* (rotation quaternion)
 * - sh_* (spherical harmonics features)
 */

export type PLYType = 'mesh' | 'splat';

export interface PLYDetectionResult {
    type: PLYType;
    vertexCount: number;
    hasColors: boolean;
    hasNormals: boolean;
    splatProperties: string[];
}

const SPLAT_PROPERTY_PATTERNS = [
    /^f_dc_\d+$/,      // DC components of SH
    /^f_rest_\d+$/,    // Rest of SH coefficients
    /^opacity$/,       // Opacity
    /^scale_\d+$/,     // Scale
    /^rot_\d+$/,       // Rotation quaternion
    /^sh_\d+$/,        // Alternative SH naming
];

export function detectPLYType(data: ArrayBuffer): PLYDetectionResult {
    // Convert to string to read header
    const decoder = new TextDecoder('ascii');
    const headerBytes = new Uint8Array(data, 0, Math.min(data.byteLength, 8192));
    const headerText = decoder.decode(headerBytes);

    // Find end of header
    const endHeaderIndex = headerText.indexOf('end_header');
    if (endHeaderIndex === -1) {
        throw new Error('Invalid PLY file: no end_header found');
    }

    const header = headerText.substring(0, endHeaderIndex);
    const lines = header.split('\n');

    let vertexCount = 0;
    let hasColors = false;
    let hasNormals = false;
    const splatProperties: string[] = [];
    const allProperties: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // Parse vertex count
        if (trimmed.startsWith('element vertex')) {
            const parts = trimmed.split(/\s+/);
            vertexCount = parseInt(parts[2], 10);
        }

        // Parse properties
        if (trimmed.startsWith('property')) {
            const parts = trimmed.split(/\s+/);
            const propName = parts[parts.length - 1];
            allProperties.push(propName);

            // Check for colors
            if (['red', 'green', 'blue', 'r', 'g', 'b', 'diffuse_red', 'diffuse_green', 'diffuse_blue'].includes(propName.toLowerCase())) {
                hasColors = true;
            }

            // Check for normals
            if (['nx', 'ny', 'nz', 'normal_x', 'normal_y', 'normal_z'].includes(propName.toLowerCase())) {
                hasNormals = true;
            }

            // Check for splat-specific properties
            for (const pattern of SPLAT_PROPERTY_PATTERNS) {
                if (pattern.test(propName)) {
                    splatProperties.push(propName);
                    break;
                }
            }
        }
    }

    // Determine type based on splat properties
    // A gaussian splat PLY should have opacity, scale, and rotation at minimum
    const hasSplatProps = splatProperties.some(p => /^opacity$/.test(p)) ||
        splatProperties.some(p => /^scale_\d+$/.test(p)) ||
        splatProperties.some(p => /^rot_\d+$/.test(p)) ||
        splatProperties.some(p => /^f_dc_\d+$/.test(p));

    const type: PLYType = hasSplatProps ? 'splat' : 'mesh';

    return {
        type,
        vertexCount,
        hasColors,
        hasNormals,
        splatProperties,
    };
}

export function isPLYSplat(data: ArrayBuffer): boolean {
    try {
        const result = detectPLYType(data);
        return result.type === 'splat';
    } catch {
        return false;
    }
}
