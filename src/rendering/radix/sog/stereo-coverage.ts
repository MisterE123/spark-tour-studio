import {Matrix4, Vector3} from 'three';
import type {Camera} from 'three';

export const XR_GUARD_ANGLE = 12;
const rotationPadding = Math.sin(XR_GUARD_ANGLE * Math.PI / 180);
const rotationPaddingSq = rotationPadding * rotationPadding;

function outsidePlane(n: Vector3, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, travel: number, padding: number) {
  const maximum = n.x * (n.x >= 0 ? x1 : x0) + n.y * (n.y >= 0 ? y1 : y0) + n.z * (n.z >= 0 ? z1 : z0);
  if (maximum >= -travel) return false;
  if (maximum < -padding) return true;
  // A long box may have its farthest corner nowhere near this plane. Check
  // each corner with its own angular margin. Signed distance plus a multiple
  // of distance to the eye is convex, so its maximum is attained at a corner.
  for (let corner = 0; corner < 8; corner++) {
    const x = corner & 1 ? x1 : x0, y = corner & 2 ? y1 : y0, z = corner & 4 ? z1 : z0;
    const signed = x * n.x + y * n.y + z * n.z + travel; // negative by the support test above
    if (signed * signed <= rotationPaddingSq * (x*x + y*y + z*z)) return false;
  }
  return true;
}

// Inward side planes, in the same coordinates as the SOG leaf bounds.
// Only the sides matter here. Geometry near the eyes and distant geometry
// in view must retain coarse coverage regardless of the clip distances.
export class StereoCoverage {
  private readonly eyes = [new Vector3(), new Vector3()];
  private readonly planes = Array.from({length: 8}, () => new Vector3());
  private readonly selectedEyes = this.eyes.map(eye => eye.clone());
  private readonly selectedPlanes = this.planes.map(plane => plane.clone());
  private readonly clip = new Matrix4();
  private readonly inverseAsset = new Matrix4();
  private valid = false;
  private selectedValid = false;

  get active() { return this.valid; }

  update(cameras: readonly Camera[] | undefined, assetWorld: Matrix4) {
    this.valid = false;
    if (cameras?.length !== 2) return;
    this.inverseAsset.copy(assetWorld).invert();
    for (let i = 0; i < 2; i++) {
      const camera = cameras[i];
      const projection = camera.projectionMatrix.elements;
      if (projection[11] !== -1 || projection[15] !== 0) return;
      this.eyes[i].setFromMatrixPosition(camera.matrixWorld).applyMatrix4(this.inverseAsset);
      this.clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(assetWorld);
      const m = this.clip.elements;
      for (let side = 0; side < 4; side++) {
        const row = side >> 1, sign = side % 2 === 0 ? 1 : -1;
        const normal = this.planes[4 * i + side].set(m[3] + sign * m[row],
          m[7] + sign * m[row + 4], m[11] + sign * m[row + 8]);
        const length = normal.length();
        if (!(length > 0 && Number.isFinite(length))) return;
        normal.divideScalar(length);
      }
    }
    this.valid = true;
  }

  remember() {
    this.selectedValid = this.valid;
    if (!this.valid) return;
    this.planes.forEach((plane, i) => this.selectedPlanes[i].copy(plane));
    this.eyes.forEach((eye, i) => this.selectedEyes[i].copy(eye));
  }

  changed(degrees: number, travel: number) {
    if (this.valid !== this.selectedValid) return true;
    if (!this.valid) return false;
    const cos = Math.cos(degrees * Math.PI / 180);
    return this.planes.some((plane, i) => plane.dot(this.selectedPlanes[i]) < cos - 1e-10)
      || this.eyes.some((eye, i) => eye.distanceToSquared(this.selectedEyes[i]) > travel * travel);
  }

  outside(bounds: Float32Array, b: number, travel: number) {
    if (!this.valid) return false;
    for (let eye = 0; eye < 2; eye++) {
      const origin = this.eyes[eye];
      const x0 = bounds[b] - origin.x, x1 = bounds[b+3] - origin.x;
      const y0 = bounds[b+1] - origin.y, y1 = bounds[b+4] - origin.y;
      const z0 = bounds[b+2] - origin.z, z1 = bounds[b+5] - origin.z;
      const farthest = Math.sqrt(Math.max(x0*x0, x1*x1) + Math.max(y0*y0, y1*y1) + Math.max(z0*z0, z1*z1));
      const padding = travel + farthest * rotationPadding;
      let excluded = false;
      for (let side = 0; side < 4; side++) {
        const n = this.planes[4*eye+side];
        if (outsidePlane(n, x0, y0, z0, x1, y1, z1, travel, padding)) { excluded = true; break; }
      }
      if (!excluded) return false;
    }
    return true;
  }
}
