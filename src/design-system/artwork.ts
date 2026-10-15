// Metro needs literal asset paths. Screens use these semantic keys instead.
export const artwork = {
  startup: {
    loading: require('../../assets/owllowance-loading-loop.gif'),
    background: '#F4F5F8',
    accent: '#24476B',
    still: require('../../assets/motion/logo-awake.png'),
  },
  owl: {
    day: require('../../assets/mascot/day-sleep.png'),
    night: require('../../assets/mascot/night-awake.png'),
    nightIdle: require('../../assets/mascot/night-idle.gif'),
    dayTap: require('../../assets/mascot/day-tap.gif'),
    nightTap: require('../../assets/mascot/night-tap.gif'),
    dayTapStill: require('../../assets/mascot/day-tap-poster.png'),
    nightTapStill: require('../../assets/mascot/night-tap-poster.png'),
  },
};

export const forestScenes = {
  midnight: { image: require('../../assets/backgrounds/forest/optimized/midnight.jpg'), night: true },
  dawn: { image: require('../../assets/backgrounds/forest/optimized/dawn.jpg'), night: true },
  sunrise: { image: require('../../assets/backgrounds/forest/optimized/sunrise.jpg'), night: false },
  morning: { image: require('../../assets/backgrounds/forest/optimized/morning.jpg'), night: false },
  forenoon: { image: require('../../assets/backgrounds/forest/optimized/forenoon.jpg'), night: false },
  noon: { image: require('../../assets/backgrounds/forest/optimized/noon.jpg'), night: false },
  afternoon: { image: require('../../assets/backgrounds/forest/optimized/afternoon.jpg'), night: false },
  dusk: { image: require('../../assets/backgrounds/forest/optimized/dusk.jpg'), night: false },
  twilight: { image: require('../../assets/backgrounds/forest/optimized/twilight.jpg'), night: true },
  evening: { image: require('../../assets/backgrounds/forest/optimized/evening.jpg'), night: true },
  night: { image: require('../../assets/backgrounds/forest/optimized/night.jpg'), night: true },
};
export type ForestSceneName = keyof typeof forestScenes;

// Device-local art schedule; these bands are not astronomical sunrise/sunset.
export function forestSceneAt(date: Date): ForestSceneName {
  const hour = date.getHours();
  if (hour < 5) return 'midnight';
  if (hour < 6) return 'dawn';
  if (hour < 7) return 'sunrise';
  if (hour < 9) return 'morning';
  if (hour < 11) return 'forenoon';
  if (hour < 13) return 'noon';
  if (hour < 17) return 'afternoon';
  if (hour < 18) return 'dusk';
  if (hour < 19) return 'twilight';
  if (hour < 21) return 'evening';
  if (hour < 23) return 'night';
  return 'midnight';
}
