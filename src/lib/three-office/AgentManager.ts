/**
 * AgentManager.ts — ported from ai-office/js/agents.js
 * Manages placing/updating agent avatars in the 3D scene using live Supabase data.
 */
import * as THREE from 'three'
import type { IaAgent } from '../../types'
import { buildAvatar, type AvatarInstance } from './AgentAvatar'

export class AgentManager {
  private scene: THREE.Scene
  private avatars: Map<string, AvatarInstance> = new Map()

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /** Sync scene avatars with the current agents list */
  sync(agents: IaAgent[]): void {
    const incomingIds = new Set(agents.map(a => a.id))

    // Remove stale avatars
    this.avatars.forEach((inst, id) => {
      if (!incomingIds.has(id)) {
        this.scene.remove(inst.group)
        this.avatars.delete(id)
      }
    })

    // Add or update
    agents.forEach((agent, index) => {
      if (this.avatars.has(agent.id)) {
        // Update status badge color (child at index 17 = badge mesh)
        // Simpler approach: remove and re-add
        const old = this.avatars.get(agent.id)!
        this.scene.remove(old.group)
        this.avatars.delete(agent.id)
      }
      const inst = buildAvatar(agent, index)
      this.scene.add(inst.group)
      this.avatars.set(agent.id, inst)
    })
  }

  /** Returns the agent id for the closest avatar to a ray, or null */
  raycast(raycaster: THREE.Raycaster): string | null {
    const groups: THREE.Object3D[] = []
    this.avatars.forEach(inst => groups.push(inst.group))

    const meshes: THREE.Mesh[] = []
    groups.forEach(g => g.traverse(c => { if ((c as THREE.Mesh).isMesh) meshes.push(c as THREE.Mesh) }))

    const hits = raycaster.intersectObjects(meshes)
    if (hits.length === 0) return null

    const hitObj = hits[0].object
    for (const [id, inst] of this.avatars) {
      let found = false
      inst.group.traverse(c => { if (c === hitObj) found = true })
      if (found) return id
    }
    return null
  }

  dispose(): void {
    this.avatars.forEach(inst => this.scene.remove(inst.group))
    this.avatars.clear()
  }
}
