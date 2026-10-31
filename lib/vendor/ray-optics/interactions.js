/*
 * Copyright 2024 The Ray Optics Simulation authors and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// MODIFIED: computational methods extracted from upstream classes.
// Pin: 9dd7706097ec8b93171e04e7985be12c3309533c. See docs/ray-optics-license.md.
import geometry from './geometry.js';
import { getEffectiveRayPowerOptions } from './rayPower.js';
export const idealLens = {
  onRayIncident(ray, rayIndex, incidentPoint) {
    var lens_length = geometry.segmentLength(this);
    var main_line_unitvector_x = (-this.p1.y + this.p2.y) / lens_length;
    var main_line_unitvector_y = (this.p1.x - this.p2.x) / lens_length;
    var mid_point = geometry.segmentMidpoint(this);

    var twoF_point_1 = geometry.point(mid_point.x + main_line_unitvector_x * 2 * this.focalLength, mid_point.y + main_line_unitvector_y * 2 * this.focalLength);  // The first point at two focal lengths
    var twoF_point_2 = geometry.point(mid_point.x - main_line_unitvector_x * 2 * this.focalLength, mid_point.y - main_line_unitvector_y * 2 * this.focalLength);  // The second point at two focal lengths

    var twoF_line_near, twoF_line_far;
    if (geometry.distanceSquared(ray.p1, twoF_point_1) < geometry.distanceSquared(ray.p1, twoF_point_2)) {
      // The first point at two focal lengths is on the same side as the ray
      twoF_line_near = geometry.parallelLineThroughPoint(this, twoF_point_1);
      twoF_line_far = geometry.parallelLineThroughPoint(this, twoF_point_2);
    } else {
      // The second point at two focal lengths is on the same side as the ray
      twoF_line_near = geometry.parallelLineThroughPoint(this, twoF_point_2);
      twoF_line_far = geometry.parallelLineThroughPoint(this, twoF_point_1);
    }

    if (this.focalLength > 0) {
      // Converging lens
      ray.p2 = geometry.linesIntersection(twoF_line_far, geometry.line(mid_point, geometry.linesIntersection(twoF_line_near, ray)));
      ray.p1 = incidentPoint;
    } else {
      // Diverging lens
      ray.p2 = geometry.linesIntersection(twoF_line_far, geometry.line(incidentPoint, geometry.linesIntersection(twoF_line_near, geometry.line(mid_point, geometry.linesIntersection(twoF_line_far, ray)))));
      ray.p1 = incidentPoint;
    }
  }
};

export const mirror = {
  onRayIncident(ray, rayIndex, incidentPoint) {
    var rx = ray.p1.x - incidentPoint.x;
    var ry = ray.p1.y - incidentPoint.y;
    var mx = this.p2.x - this.p1.x;
    var my = this.p2.y - this.p1.y;

    ray.p1 = incidentPoint;
    ray.p2 = geometry.point(incidentPoint.x + rx * (my * my - mx * mx) - 2 * ry * mx * my, incidentPoint.y + ry * (mx * mx - my * my) - 2 * rx * mx * my);
  }
};

export const glass = {
  refract(ray, rayIndex, incidentPoint, normal, n1, surfaceMergingObjs, bodyMergingObj) {

    // Surface merging
    for (var i = 0; i < surfaceMergingObjs.length; i++) {
      let incidentType = surfaceMergingObjs[i].getIncidentType(ray);
      if (incidentType == 1) {
        // From inside to outside
        n1 *= surfaceMergingObjs[i].getRefIndexAt(incidentPoint, ray);
        surfaceMergingObjs[i].onRayExit(ray);
      } else if (incidentType == -1) {
        // From outside to inside
        n1 /= surfaceMergingObjs[i].getRefIndexAt(incidentPoint, ray);
        surfaceMergingObjs[i].onRayEnter(ray);
      } else if (incidentType == 0) {
        // Equivalent to not intersecting with the obj (e.g. two interfaces overlap)
        //n1=n1;
      } else {
        // Situation that may cause bugs (e.g. incident on an edge point)
        // To prevent shooting the ray to a wrong direction, absorb the ray
        return {
          isAbsorbed: true,
          isUndefinedBehavior: true
        };
      }
    }

    // Negative modifier for working with negative indices of refraction
    var mod_neg = false;
    if (n1 < 0) {
      n1 = -n1;     // Flip n1 for compatibility with the following equations
      mod_neg = true;
    }

    var normal_len = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
    var normal_x = normal.x / normal_len;
    var normal_y = normal.y / normal_len;

    var ray_len = Math.sqrt((ray.p2.x - ray.p1.x) * (ray.p2.x - ray.p1.x) + (ray.p2.y - ray.p1.y) * (ray.p2.y - ray.p1.y));

    var ray_x = (ray.p2.x - ray.p1.x) / ray_len;
    var ray_y = (ray.p2.y - ray.p1.y) / ray_len;


    // Reference http://en.wikipedia.org/wiki/Snell%27s_law#Vector_form

    var cos1 = -normal_x * ray_x - normal_y * ray_y;
    var sq1 = 1 - n1 * n1 * (1 - cos1 * cos1);


    if (sq1 < 0) {
      // Total internal reflection
      ray.p1 = incidentPoint;
      ray.p2 = geometry.point(incidentPoint.x + ray_x + 2 * cos1 * normal_x, incidentPoint.y + ray_y + 2 * cos1 * normal_y);
      if (bodyMergingObj) {
        ray.bodyMergingObj = bodyMergingObj;
      }
    } else {
      // Refraction
      var cos2 = Math.sqrt(sq1);

      if (this.partialReflect) {
        var R_s = Math.pow((n1 * cos1 - cos2) / (n1 * cos1 + cos2), 2);
        var R_p = Math.pow((n1 * cos2 - cos1) / (n1 * cos2 + cos1), 2);
      // Reference http://en.wikipedia.org/wiki/Fresnel_equations#Definitions_and_power_equations
      } else {
        var R_s = 0;
        var R_p = 0;
      }

      let newRays = [];
      let truncation = 0;
      const {
        rayPowerCutoff,
        rayPowerSampling
      } = getEffectiveRayPowerOptions(this.scene);

      // Handle the reflected ray
      var ray2 = geometry.line(incidentPoint, geometry.point(incidentPoint.x + ray_x + 2 * cos1 * normal_x, incidentPoint.y + ray_y + 2 * cos1 * normal_y));
      ray2.brightness_s = ray.brightness_s * R_s;
      ray2.brightness_p = ray.brightness_p * R_p;
      ray2.wavelength = ray.wavelength;
      ray2.gap = ray.gap;
      if (bodyMergingObj) {
        ray2.bodyMergingObj = bodyMergingObj;
      }
      const reflectedPower = ray2.brightness_s + ray2.brightness_p;
      if (reflectedPower > 0 && reflectedPower >= rayPowerCutoff) {
        newRays.push(ray2);
      } else {
        truncation += reflectedPower;
        if (reflectedPower > 0 && rayPowerSampling && !ray.gap) {
          var amp = Math.floor(rayPowerCutoff / reflectedPower) + 1;
          if (rayIndex % amp == 0) {
            ray2.brightness_s = ray2.brightness_s * amp;
            ray2.brightness_p = ray2.brightness_p * amp;
            newRays.push(ray2);
          }
        }
      }

      // Handle the refracted ray

      // Handle negative refractive index
      if (mod_neg) {
        // Restore n1
        n1 = -n1;

        // Flip sign of cos2
        cos2 = Math.cos(2 * Math.PI - Math.acos(cos2));
      }

      ray.p1 = incidentPoint;
      ray.p2 = geometry.point(incidentPoint.x + n1 * ray_x + (n1 * cos1 - cos2) * normal_x, incidentPoint.y + n1 * ray_y + (n1 * cos1 - cos2) * normal_y);
      ray.brightness_s = ray.brightness_s * (1 - R_s);
      ray.brightness_p = ray.brightness_p * (1 - R_p);

      const refractedPower = ray.brightness_s + ray.brightness_p;
      const refractedCutoff = this.scene.colorMode === 'default'
        ? 0
        : rayPowerCutoff;
      if (refractedPower > 0 && refractedPower >= refractedCutoff) {
        return {
          newRays: newRays,
          truncation: truncation
        };
      } else {
        return {
          isAbsorbed: true,
          newRays: newRays,
          truncation: truncation + refractedPower
        };
      }
    }
  }
};
