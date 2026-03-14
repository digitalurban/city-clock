import { CAR_SPEED } from '../utils/constants';
import type { CityLayout, RoadSegment } from '../city/CityLayout';
import type { Pedestrian } from './Pedestrian';

const CAR_COLORS = [
  '#2c3e50', '#e74c3c', '#3498db', '#f1c40f',
  '#1abc9c', '#e67e22', '#9b59b6', '#ecf0f1',
  '#34495e', '#c0392b', '#2980b9', '#27ae60',
];

export class Car {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  baseSpeed: number;
  currentSpeed: number;
  color: string;
  length: number;
  width: number;
  road: RoadSegment;
  dirX: number;
  dirY: number;

  constructor(layout: CityLayout) {
    this.baseSpeed = CAR_SPEED * (0.3 + Math.random() * 0.4); // slower base speed
    this.currentSpeed = this.baseSpeed;
    this.color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    this.length = 14 + Math.random() * 6;
    this.width = 7 + Math.random() * 2;

    // Pick a random road segment
    const roads = layout.roads;
    this.road = roads[Math.floor(Math.random() * roads.length)];

    if (this.road.horizontal) {
      const direction = Math.random() > 0.5 ? 1 : -1;
      this.x = this.road.x + Math.random() * this.road.w;
      this.y = this.road.y + (direction > 0 ? this.road.h * 0.25 : this.road.h * 0.75);
      this.dirX = direction;
      this.dirY = 0;
      this.angle = direction > 0 ? 0 : Math.PI;
    } else {
      const direction = Math.random() > 0.5 ? 1 : -1;
      this.y = this.road.y + Math.random() * this.road.h;
      this.x = this.road.x + (direction > 0 ? this.road.w * 0.25 : this.road.w * 0.75);
      this.dirX = 0;
      this.dirY = direction;
      this.angle = direction > 0 ? Math.PI / 2 : -Math.PI / 2;
    }

    this.vx = this.dirX * this.baseSpeed;
    this.vy = this.dirY * this.baseSpeed;
  }

  update(layout: CityLayout, pedestrians: Pedestrian[], cars: Car[]) {
    // Check for pedestrians ahead — slow down or stop
    let targetSpeed = this.baseSpeed;
    const lookAhead = 40;
    const lookWidth = 12;

    // Front of car in world coords
    const frontX = this.x + this.dirX * this.length * 0.5;
    const frontY = this.y + this.dirY * this.length * 0.5;

    for (const p of pedestrians) {
      const dx = p.x - frontX;
      const dy = p.y - frontY;

      // Distance along car's direction of travel
      const along = dx * this.dirX + dy * this.dirY;
      // Perpendicular distance
      const perp = Math.abs(dx * this.dirY - dy * this.dirX);

      if (along > 0 && along < lookAhead && perp < lookWidth) {
        // Pedestrian ahead — slow proportionally
        const brakeFactor = along / lookAhead;
        targetSpeed = Math.min(targetSpeed, this.baseSpeed * brakeFactor * 0.5);
      }
    }

    // Also check for cars ahead (avoid rear-ending)
    for (const other of cars) {
      if (other === this) continue;
      const dx = other.x - frontX;
      const dy = other.y - frontY;
      const along = dx * this.dirX + dy * this.dirY;
      const perp = Math.abs(dx * this.dirY - dy * this.dirX);

      if (along > 0 && along < 30 && perp < 10) {
        const brakeFactor = along / 30;
        targetSpeed = Math.min(targetSpeed, this.baseSpeed * brakeFactor * 0.3);
      }
    }

    // Smoothly adjust speed
    this.currentSpeed += (targetSpeed - this.currentSpeed) * 0.1;
    if (this.currentSpeed < 0.02) this.currentSpeed = 0;

    this.vx = this.dirX * this.currentSpeed;
    this.vy = this.dirY * this.currentSpeed;
    this.x += this.vx;
    this.y += this.vy;

    // Wrap around edges
    const margin = 50;
    if (this.x < -margin) this.x = layout.width + margin;
    if (this.x > layout.width + margin) this.x = -margin;
    if (this.y < -margin) this.y = layout.height + margin;
    if (this.y > layout.height + margin) this.y = -margin;
  }

  draw(ctx: CanvasRenderingContext2D, nightAlpha: number) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Brake lights glow when slowing
    const isBraking = this.currentSpeed < this.baseSpeed * 0.5;

    // Car body shadow
    ctx.fillStyle = `rgba(0, 0, 0, ${0.2 + nightAlpha * 0.1})`;
    ctx.fillRect(-this.length / 2 + 1.5, -this.width / 2 + 1.5, this.length, this.width);

    // Car body
    const darkFactor = 1 - nightAlpha * 0.4;
    const r = parseInt(this.color.slice(1, 3), 16);
    const g = parseInt(this.color.slice(3, 5), 16);
    const b = parseInt(this.color.slice(5, 7), 16);
    ctx.fillStyle = `rgb(${Math.floor(r * darkFactor)}, ${Math.floor(g * darkFactor)}, ${Math.floor(b * darkFactor)})`;

    // Rounded rectangle for car body
    const hw = this.length / 2;
    const hh = this.width / 2;
    const cr = 2;
    ctx.beginPath();
    ctx.moveTo(-hw + cr, -hh);
    ctx.lineTo(hw - cr, -hh);
    ctx.quadraticCurveTo(hw, -hh, hw, -hh + cr);
    ctx.lineTo(hw, hh - cr);
    ctx.quadraticCurveTo(hw, hh, hw - cr, hh);
    ctx.lineTo(-hw + cr, hh);
    ctx.quadraticCurveTo(-hw, hh, -hw, hh - cr);
    ctx.lineTo(-hw, -hh + cr);
    ctx.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
    ctx.fill();

    // Windshield
    ctx.fillStyle = `rgba(150, 200, 230, ${0.6 - nightAlpha * 0.3})`;
    ctx.fillRect(this.length * 0.15, -this.width / 2 + 1.5, this.length * 0.2, this.width - 3);

    // Headlights (more visible at night)
    if (nightAlpha > 0.1) {
      const headlightAlpha = 0.3 + nightAlpha * 0.7;
      ctx.fillStyle = `rgba(255, 240, 180, ${headlightAlpha})`;
      ctx.beginPath();
      ctx.arc(this.length / 2, -this.width / 2 + 1.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.length / 2, this.width / 2 - 1.5, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Headlight beams
      if (nightAlpha > 0.3) {
        const grad = ctx.createRadialGradient(this.length / 2 + 5, 0, 0, this.length / 2 + 5, 0, 25);
        grad.addColorStop(0, `rgba(255, 240, 180, ${nightAlpha * 0.2})`);
        grad.addColorStop(1, 'rgba(255, 240, 180, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(this.length / 2, -15, 30, 30);
      }
    }

    // Taillights (brighter when braking)
    const tailAlpha = isBraking ? 0.9 : (0.4 + nightAlpha * 0.4);
    ctx.fillStyle = `rgba(255, 50, 50, ${tailAlpha})`;
    ctx.fillRect(-this.length / 2, -this.width / 2 + 1, 2, 2);
    ctx.fillRect(-this.length / 2, this.width / 2 - 3, 2, 2);

    ctx.restore();
  }
}
