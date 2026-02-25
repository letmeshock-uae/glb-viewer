import { Effect, BlendFunction } from 'postprocessing';
import * as THREE from 'three';

const fragmentShader = `
uniform float temperature;
uniform float tint;
uniform float exposure;
uniform float highlights;
uniform float shadows;

// Convert RGB to Luminance
float getLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // Apply exposure first (linear space)
    vec3 color = inputColor.rgb * exposure;

    // Temperature (Blue vs Orange)
    // Positive temperature adds orange, negative adds blue
    vec3 tempColor = color;
    tempColor.r += temperature * 0.1;
    tempColor.b -= temperature * 0.1;

    // Tint (Green vs Magenta)
    // Positive tint adds magenta, negative adds green
    vec3 tintColor = tempColor;
    tintColor.g -= tint * 0.1;
    tintColor.r += tint * 0.05;
    tintColor.b += tint * 0.05;

    // Preserve luminance to avoid brightness shifts
    float originalLum = getLuminance(color);
    float newLum = getLuminance(tintColor);
    
    vec3 finalColor = tintColor * (originalLum / max(newLum, 0.0001));

    // Shadows and Highlights adjustment
    float lum = getLuminance(finalColor);
    
    // Smoothstep masks for shadows (dark areas) and highlights (bright areas)
    float shadowMask = 1.0 - smoothstep(0.0, 0.5, lum);
    float highlightMask = smoothstep(0.5, 1.0, lum);

    // Default shadows/highlights uniform is 1.0. 
    // Multiply by the respective mask to brighten or darken those regions.
    finalColor += finalColor * shadowMask * (shadows - 1.0);
    finalColor += finalColor * highlightMask * (highlights - 1.0);

    // Prevent negative colors
    finalColor = max(finalColor, 0.0);

    outputColor = vec4(finalColor, inputColor.a);
}
`;

export class ColorGradingEffect extends Effect {
    constructor() {
        super('ColorGradingEffect', fragmentShader, {
            blendFunction: BlendFunction.NORMAL,
            uniforms: new Map<string, THREE.Uniform>([
                ['temperature', new THREE.Uniform(0.0)],
                ['tint', new THREE.Uniform(0.0)],
                ['exposure', new THREE.Uniform(1.0)],
                ['highlights', new THREE.Uniform(1.0)],
                ['shadows', new THREE.Uniform(1.0)],
            ])
        });
    }

    set temperature(value: number) {
        this.uniforms.get('temperature')!.value = value;
    }

    get temperature(): number {
        return this.uniforms.get('temperature')!.value;
    }

    set tint(value: number) {
        this.uniforms.get('tint')!.value = value;
    }

    get tint(): number {
        return this.uniforms.get('tint')!.value;
    }

    set exposure(value: number) {
        this.uniforms.get('exposure')!.value = value;
    }

    get exposure(): number {
        return this.uniforms.get('exposure')!.value;
    }

    set highlights(value: number) {
        this.uniforms.get('highlights')!.value = value;
    }

    get highlights(): number {
        return this.uniforms.get('highlights')!.value;
    }

    set shadows(value: number) {
        this.uniforms.get('shadows')!.value = value;
    }

    get shadows(): number {
        return this.uniforms.get('shadows')!.value;
    }
}
