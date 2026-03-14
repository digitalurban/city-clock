export const PEDS_PER_SEGMENT = 4;
export const CLOCK_ELIGIBLE_COUNT = 28 * PEDS_PER_SEGMENT; // 112
export const TOTAL_PEDESTRIANS = 160;
export const TOTAL_CARS = 20;
export const CLOCK_ACTIVE_SECONDS = 15;

export const DIGIT_WIDTH = 80;
export const DIGIT_HEIGHT = 130;
export const DIGIT_SPACING = 35;
export const DIGIT_GROUP_SPACING = 60;

export const BLOCK_SIZE = 120;
export const ROAD_WIDTH = 36;
export const SIDEWALK_WIDTH = 10;

export const PEDESTRIAN_BASE_SPEED = 0.28;
export const PEDESTRIAN_MAX_FORCE = 0.05;
export const SEPARATION_RADIUS = 15;
export const WANDER_STRENGTH = 0.4;

export const CAR_SPEED = 1.2;

// Building color palettes (day)
export const BUILDING_COLORS = [
  '#8b9dc3', '#a3b5cc', '#c9b8a8', '#b8a88c',
  '#9ca8b8', '#a8b4a0', '#bfb0a0', '#c4a882',
  '#7a8fa6', '#a09080', '#b0a898', '#98a0b0',
  '#c0b090', '#a8a0c0', '#b8c0a8', '#c8b0a0',
];

// Pedestrian clothing colors
export const PEDESTRIAN_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
  '#c0392b', '#2980b9', '#27ae60', '#f1c40f',
  '#8e44ad', '#16a085', '#d35400', '#2c3e50',
  '#e84393', '#00b894', '#fdcb6e', '#6c5ce7',
];
