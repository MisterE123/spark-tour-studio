// SPDX-License-Identifier: MIT
// Copyright (c) 2026 WORLD LABS TECHNOLOGIES, INC.
// Adapted from https://github.com/sparkjsdev/radix/blob/b831cc5e98b52a83b6f0ac6ba5fc50b5ac883be1/examples/sogs/resident.ts
// Local changes: imports, validation, cancellation and resource ownership. See ../README.md.
// GPU arrays shared by splat objects: freed once the owner drops them and
// every object holding them has been released (Radix releases an object
// when no live collection, including a CPU sort's in-flight orders, holds it)
export class Resident {
  private holds = 0;
  private dropped = false;
  private freed = false;
  private readonly free: () => void;

  constructor(free: () => void) {
    this.free = free;
  }

  // A release callback for one object that draws these arrays
  hold(): () => void {
    this.holds += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.holds -= 1;
        this.check();
      }
    };
  }

  drop() {
    this.dropped = true;
    this.check();
  }

  private check() {
    if (this.dropped && this.holds === 0 && !this.freed) {
      this.freed = true;
      this.free();
    }
  }
}
