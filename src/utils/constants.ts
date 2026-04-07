export const PEDS_PER_SEGMENT = 4;
export const CLOCK_ELIGIBLE_COUNT = 28 * PEDS_PER_SEGMENT; // 112
export let TOTAL_PEDESTRIANS = 160;
export let TOTAL_CARS = 70;
export const CLOCK_ACTIVE_SECONDS = 15;

// Allow runtime adjustment
export function setTotalPedestrians(n: number) { TOTAL_PEDESTRIANS = n; }
export function setTotalCars(n: number) { TOTAL_CARS = n; }

export const DIGIT_WIDTH = 80;
export const DIGIT_HEIGHT = 130;
export const DIGIT_SPACING = 35;
export const DIGIT_GROUP_SPACING = 60;

export const BLOCK_SIZE = 120;
export const ROAD_WIDTH = 36;
export const SIDEWALK_WIDTH = 10;

export const PEDESTRIAN_BASE_SPEED = 0.14;
export const PEDESTRIAN_MAX_FORCE = 0.025;
export const SEPARATION_RADIUS = 15;
export const WANDER_STRENGTH = 0.2;

export const CAR_SPEED = 0.6;

// Building color palettes (day)
export const BUILDING_COLORS = [
  '#9ba08e', '#b5a88e', '#c9b8a8', '#b8a88c',
  '#a8a898', '#a8b4a0', '#bfb0a0', '#c4a882',
  '#8a8880', '#a09080', '#b0a898', '#a09888',
  '#c0b090', '#a8a090', '#b8c0a8', '#c8b0a0',
];

// House color palettes
export const HOUSE_COLORS = [
  '#e8d5b7', '#d4c4a8', '#c2b090', '#f5e6d0',
  '#dbc8a0', '#e0cdb5', '#c8b898', '#f0e0c0',
  '#d8c0a0', '#e5d8c0', '#cfc0a8', '#f2e8d8',
];

// Garden green shades
export const GARDEN_COLORS = [
  '#4a7c3f', '#5a8c4f', '#3a6c30', '#6a9c5f',
  '#507840', '#4d8844', '#5e9450', '#3f7035',
];

// Pedestrian clothing colors
export const PEDESTRIAN_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
  '#c0392b', '#2980b9', '#27ae60', '#f1c40f',
  '#8e44ad', '#16a085', '#d35400', '#2c3e50',
  '#e84393', '#00b894', '#fdcb6e', '#6c5ce7',
];
