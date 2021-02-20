if (hubs_HighlightInteractorOne || hubs_HighlightInteractorTwo || hubs_IsFrozen) {
  float ratio = 0.0;
  float size = hubs_SweepParams.t - hubs_SweepParams.s;

  if (hubs_EnableSweepingEffect) {
    float line = mod(hubs_Time / 500.0 * size, size * 3.0) + hubs_SweepParams.s - size / 3.0;

    if (hubs_WorldPosition.y < line) {
      // Highlight with a sweeping gradient.
      ratio = max(0.0, 1.0 - (line - hubs_WorldPosition.y) / (size * 1.5));
    }
  }

  // Highlight with a gradient falling off with distance.
  float pulse = 1.0 / (size + 0.2) * 8.0 + 1.0 / (size + 0.3) * 3.0 * (sin(hubs_Time / 1000.0) + 1.0);

  if (hubs_HighlightInteractorOne) {
    float dist1 = distance(hubs_WorldPosition, hubs_InteractorOnePos);
    ratio += -min(1.0, pow(dist1 * pulse, 3.0)) + 1.0;
  } 

  if (hubs_HighlightInteractorTwo) {
    float dist2 = distance(hubs_WorldPosition, hubs_InteractorTwoPos);
    ratio += -min(1.0, pow(dist2 * pulse, 3.0)) + 1.0;
  }

  ratio = min(1.0, ratio);

  // Gamma corrected highlight color
  vec3 highlightColor = vec3(0.184, 0.499, 0.933);

  gl_FragColor.rgb = (gl_FragColor.rgb * (1.0 - ratio)) + (highlightColor * ratio);
}
