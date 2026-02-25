import * as THREE from 'three';

export type LightType = 'directional' | 'spot' | 'point' | 'hemisphere' | 'ambient' | 'rectarea';

export interface LightConfig {
    type: LightType;
    name: string;
    color: THREE.ColorRepresentation;
    intensity: number;
    position?: THREE.Vector3;
    target?: THREE.Vector3;
    castShadow?: boolean;
    // Spot specific
    angle?: number;
    penumbra?: number;
    distance?: number;
    decay?: number;
    // RectArea specific
    width?: number;
    height?: number;
    // Hemisphere specific
    groundColor?: THREE.ColorRepresentation;
}

export interface ManagedLight {
    id: string;
    config: LightConfig;
    light: THREE.Light;
    helper?: THREE.Object3D;
}

export class LightsManager {
    private scene: THREE.Scene;
    private lights: Map<string, ManagedLight> = new Map();
    private lightIdCounter: number = 0;
    private helpersVisible: boolean = false;
    private groundPlane: THREE.Mesh | null = null;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.addDefaultLights();
    }

    private addDefaultLights(): void {
        // Lights are now intentionally left empty by default.
        // The procedural environment map (IBL) provides the base lighting for the PBR materials.
        // Users can add their own directional or spot lights via the UI if needed.
    }

    public addLight(config: LightConfig): string {
        const id = `light_${this.lightIdCounter++}`;
        let light: THREE.Light;
        let helper: THREE.Object3D | undefined;

        switch (config.type) {
            case 'directional':
                light = new THREE.DirectionalLight(config.color as THREE.ColorRepresentation, config.intensity);
                if (config.position) light.position.copy(config.position);
                if (config.castShadow) {
                    this.setupDirectionalShadow(light as THREE.DirectionalLight);
                }
                helper = new THREE.DirectionalLightHelper(light as THREE.DirectionalLight, 5);
                break;

            case 'spot':
                light = new THREE.SpotLight(
                    config.color as THREE.ColorRepresentation,
                    config.intensity,
                    config.distance ?? 100,
                    config.angle ?? Math.PI / 6,
                    config.penumbra ?? 0.3,
                    config.decay ?? 2
                );
                if (config.position) light.position.copy(config.position);
                if (config.castShadow) {
                    light.castShadow = true;
                    (light as THREE.SpotLight).shadow.mapSize.width = 2048;
                    (light as THREE.SpotLight).shadow.mapSize.height = 2048;
                    (light as THREE.SpotLight).shadow.bias = -0.0001;
                }
                helper = new THREE.SpotLightHelper(light as THREE.SpotLight);
                break;

            case 'point':
                light = new THREE.PointLight(
                    config.color as THREE.ColorRepresentation,
                    config.intensity,
                    config.distance ?? 100,
                    config.decay ?? 2
                );
                if (config.position) light.position.copy(config.position);
                if (config.castShadow) {
                    light.castShadow = true;
                    (light as THREE.PointLight).shadow.mapSize.width = 1024;
                    (light as THREE.PointLight).shadow.mapSize.height = 1024;
                }
                helper = new THREE.PointLightHelper(light as THREE.PointLight, 1);
                break;

            case 'hemisphere':
                light = new THREE.HemisphereLight(
                    config.color as THREE.ColorRepresentation,
                    config.groundColor ?? 0x444444,
                    config.intensity
                );
                helper = new THREE.HemisphereLightHelper(light as THREE.HemisphereLight, 5);
                break;

            case 'ambient':
                light = new THREE.AmbientLight(config.color as THREE.ColorRepresentation, config.intensity);
                break;

            case 'rectarea':
                light = new THREE.RectAreaLight(
                    config.color as THREE.ColorRepresentation,
                    config.intensity,
                    config.width ?? 4,
                    config.height ?? 4
                );
                if (config.position) light.position.copy(config.position);
                break;

            default:
                throw new Error(`Unknown light type: ${config.type}`);
        }

        this.scene.add(light);
        if (helper) {
            helper.visible = this.helpersVisible;
            this.scene.add(helper);
        }

        const managed: ManagedLight = { id, config, light, helper };
        this.initBaseValues(id, config.color, config.intensity);
        this.lights.set(id, managed);

        return id;
    }

    private setupDirectionalShadow(light: THREE.DirectionalLight): void {
        light.castShadow = true;
        // Use larger shadow map for better quality on large models
        light.shadow.mapSize.width = 8192;
        light.shadow.mapSize.height = 8192;
        light.shadow.bias = -0.00005;
        light.shadow.normalBias = 0.01;
        light.shadow.radius = 2; // Soft shadow edge

        // Default large frustum - will be adjusted by updateShadowsForModel
        const shadowSize = 500;
        light.shadow.camera.left = -shadowSize;
        light.shadow.camera.right = shadowSize;
        light.shadow.camera.top = shadowSize;
        light.shadow.camera.bottom = -shadowSize;
        light.shadow.camera.near = 0.1;
        light.shadow.camera.far = 2000;
        light.shadow.camera.updateProjectionMatrix();
    }

    /**
     * Dynamically adjust shadow camera to fit the loaded model
     */
    public updateShadowsForModel(model: THREE.Object3D): void {
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const shadowSize = maxDim * 1.5;

        console.log('🔦 Updating shadows for model:', {
            size: size.toArray(),
            center: center.toArray(),
            shadowSize
        });

        this.lights.forEach((managed) => {
            if (managed.light instanceof THREE.DirectionalLight && managed.light.castShadow) {
                const dirLight = managed.light;

                // Position light relative to model center
                dirLight.position.set(
                    center.x + maxDim * 0.5,
                    center.y + maxDim * 1.0,
                    center.z + maxDim * 0.5
                );
                dirLight.target.position.copy(center);
                this.scene.add(dirLight.target);

                // Adjust shadow camera frustum
                dirLight.shadow.camera.left = -shadowSize;
                dirLight.shadow.camera.right = shadowSize;
                dirLight.shadow.camera.top = shadowSize;
                dirLight.shadow.camera.bottom = -shadowSize;
                dirLight.shadow.camera.near = maxDim * 0.01;
                dirLight.shadow.camera.far = maxDim * 5;
                dirLight.shadow.camera.updateProjectionMatrix();

                // Update helper if exists
                if (managed.helper && 'update' in managed.helper) {
                    (managed.helper as THREE.DirectionalLightHelper).update();
                }
            }
        });
    }

    /**
     * Add an invisible ground plane to receive shadows
     */
    public addShadowGround(y: number = 0, size: number = 1000): void {
        if (this.groundPlane) {
            this.scene.remove(this.groundPlane);
            this.groundPlane.geometry.dispose();
            (this.groundPlane.material as THREE.Material).dispose();
        }

        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.ShadowMaterial({
            opacity: 0.5,
            color: 0x000000,
        });

        this.groundPlane = new THREE.Mesh(geometry, material);
        this.groundPlane.rotation.x = -Math.PI / 2;
        this.groundPlane.position.y = y;
        this.groundPlane.receiveShadow = true;
        this.groundPlane.name = 'ShadowGround';

        this.scene.add(this.groundPlane);
    }

    public removeLight(id: string): boolean {
        const managed = this.lights.get(id);
        if (!managed) return false;

        this.scene.remove(managed.light);
        if (managed.helper) {
            this.scene.remove(managed.helper);
        }
        managed.light.dispose?.();

        this.lights.delete(id);
        return true;
    }

    public updateLight(id: string, updates: Partial<LightConfig>): void {
        const managed = this.lights.get(id);
        if (!managed) return;

        const light = managed.light;

        if (updates.color !== undefined) {
            (light as THREE.DirectionalLight).color.set(updates.color);
        }
        if (updates.intensity !== undefined) {
            light.intensity = updates.intensity;
        }
        if (updates.position !== undefined) {
            light.position.copy(updates.position);
        }
        if (updates.castShadow !== undefined) {
            light.castShadow = updates.castShadow;
        }

        // Update helper if exists
        if (managed.helper && 'update' in managed.helper) {
            (managed.helper as THREE.DirectionalLightHelper).update();
        }

        // Merge updates into config
        Object.assign(managed.config, updates);
    }

    public getLights(): ManagedLight[] {
        return Array.from(this.lights.values());
    }

    public getLight(id: string): ManagedLight | undefined {
        return this.lights.get(id);
    }

    public toggleHelpers(visible?: boolean): void {
        this.helpersVisible = visible ?? !this.helpersVisible;
        this.lights.forEach((managed) => {
            if (managed.helper) {
                managed.helper.visible = this.helpersVisible;
            }
        });
    }

    public clearAll(): void {
        this.lights.forEach((_, id) => this.removeLight(id));
        if (this.groundPlane) {
            this.scene.remove(this.groundPlane);
            this.groundPlane = null;
        }
    }

    public reset(): void {
        this.clearAll();
        this.addDefaultLights();
    }

    /**
     * Enable or disable shadows on all lights
     */
    public setShadowsEnabled(enabled: boolean): void {
        this.lights.forEach((managed) => {
            if (managed.light instanceof THREE.DirectionalLight ||
                managed.light instanceof THREE.SpotLight ||
                managed.light instanceof THREE.PointLight) {
                managed.light.castShadow = enabled && (managed.config.castShadow ?? false);
            }
        });
    }

    /**
     * Set shadow intensity (ground plane opacity)
     */
    public setShadowIntensity(intensity: number): void {
        if (this.groundPlane && this.groundPlane.material instanceof THREE.ShadowMaterial) {
            this.groundPlane.material.opacity = intensity;
        }
    }

    /**
     * Set shadow softness (shadow radius)
     */
    public setShadowSoftness(radius: number): void {
        this.lights.forEach((managed) => {
            if (managed.light instanceof THREE.DirectionalLight && managed.light.castShadow) {
                managed.light.shadow.radius = radius;
            }
            if (managed.light instanceof THREE.SpotLight && managed.light.castShadow) {
                managed.light.shadow.radius = radius;
            }
        });
    }

    /**
     * Show or hide the ground plane
     */
    public setGroundVisible(visible: boolean): void {
        if (this.groundPlane) {
            this.groundPlane.visible = visible;
        }
    }

    /**
     * Get a reference to the ground plane
     */
    public getGroundPlane(): THREE.Mesh | null {
        return this.groundPlane;
    }

    // --- Color Grading & Lighting Helpers ---

    private baseColors = new Map<string, THREE.Color>();
    private baseIntensities = new Map<string, number>();

    private temperature: number = 0; // -1 to 1 (blue to orange)
    private tint: number = 0;        // -1 to 1 (green to magenta)
    private highlights: number = 1.0; // Multiplier for directional lights
    private shadows: number = 1.0;    // Multiplier for fill/ambient lights

    private initBaseValues(id: string, color: THREE.ColorRepresentation, intensity: number) {
        if (!this.baseColors.has(id)) {
            this.baseColors.set(id, new THREE.Color(color as THREE.ColorRepresentation));
        }
        if (!this.baseIntensities.has(id)) {
            this.baseIntensities.set(id, intensity);
        }
    }

    private applyColorGrading(): void {
        const tempColor = new THREE.Color();
        const tintColor = new THREE.Color();

        // Temperature (Blue vs Orange)
        if (this.temperature > 0) {
            tempColor.setHex(0xffaa00); // Warm
        } else {
            tempColor.setHex(0x00aaff); // Cool
        }

        // Tint (Green vs Magenta)
        if (this.tint > 0) {
            tintColor.setHex(0xff00ff); // Magenta
        } else {
            tintColor.setHex(0x00ff00); // Green
        }

        this.lights.forEach((managed, id) => {
            const baseColor = this.baseColors.get(id);
            const baseIntensity = this.baseIntensities.get(id);

            if (!baseColor || baseIntensity === undefined) return;

            // Apply color shift
            const finalColor = baseColor.clone();
            if (this.temperature !== 0) {
                finalColor.lerp(tempColor, Math.abs(this.temperature) * 0.3); // Max 30% blend
            }
            if (this.tint !== 0) {
                finalColor.lerp(tintColor, Math.abs(this.tint) * 0.3); // Max 30% blend
            }

            if ('color' in managed.light) {
                (managed.light as THREE.DirectionalLight).color.copy(finalColor);
            }

            // Apply intensity multipliers
            let multiplier = 1.0;
            // Treat directional/spot as highlights, others as shadows
            if (managed.config.type === 'directional' || managed.config.type === 'spot') {
                multiplier = this.highlights;
            } else {
                multiplier = this.shadows;
            }

            managed.light.intensity = baseIntensity * multiplier;
            managed.config.color = finalColor;
            managed.config.intensity = managed.light.intensity;
        });
    }

    public setTemperature(value: number): void {
        this.temperature = value;
        this.applyColorGrading();
    }

    public setTint(value: number): void {
        this.tint = value;
        this.applyColorGrading();
    }

    public setHighlights(value: number): void {
        this.highlights = value;
        this.applyColorGrading();
    }

    public setShadows(value: number): void {
        this.shadows = value;
        this.applyColorGrading();
    }
}
