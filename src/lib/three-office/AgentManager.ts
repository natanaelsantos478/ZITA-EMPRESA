/**
 * AgentManager.ts — manages AgentAvatar instances using live Supabase data.
 */
import * as THREE from 'three'
import type { IaAgent } from '../../types'
import { AgentAvatar } from './AgentAvatar'

export class AgentManager {
  private scene:   THREE.Scene
  private avatars: Map<string, AgentAvatar> = new Map()

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  sync(agents: IaAgent[]): void {
    const incomingIds = new Set(agents.map(a => a.id))

    // Remove stale avatars
    this.avatars.forEach((avatar, id) => {
      if (!incomingIds.has(id)) {
        avatar.dispose()
        this.avatars.delete(id)
      }
    })

    // Add or replace changed agents
    agents.forEach((agent, index) => {
      if (this.avatars.has(agent.id)) {
        const existing = this.avatars.get(agent.id)!
        existing.dispose()
        this.avatars.delete(agent.id)
      }
      const avatar = new AgentAvatar(this.scene, agent, index)
      this.avatars.set(agent.id, avatar)
    })
  }

  /** Call every animation frame to advance avatar animations */
  update(delta: number, elapsed: number): void {
    this.avatars.forEach(a => a.update(delta, elapsed))
  }

  /** Call every frame after render() to reposition HTML name tags / speech bubbles */
  updateHTML(camera: THREE.Camera, canvas: HTMLElement): void {
    this.avatars.forEach(a => a.updateHTML(camera, canvas))
  }

  raycast(raycaster: THREE.Raycaster): string | null {
    const meshes: THREE.Mesh[] = []
    this.avatars.forEach(avatar => {
      avatar.group.traverse(c => {
        if ((c as THREE.Mesh).isMesh) meshes.push(c as THREE.Mesh)
      })
    })

    const hits = raycaster.intersectObjects(meshes)
    if (hits.length === 0) return null

    const hitObj = hits[0].object
    for (const [id, avatar] of this.avatars) {
      if (avatar.owns(hitObj)) return id
    }
    return null
  }

  dispose(): void {
    this.avatars.forEach(a => a.dispose())
    this.avatars.clear()
  }
}
