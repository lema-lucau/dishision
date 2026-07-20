module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated requires its babel plugin to run last (PhotoViewer's pinch-zoom, §5.9).
    plugins: ['react-native-reanimated/plugin'],
  };
};
