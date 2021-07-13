// Based on: https://www.shadertoy.com/view/Mll3D4#

precision highp float;
precision highp int;

varying vec2 vUv;
varying vec3 vNormal;
uniform float time;

const int LINEAR = 0;
const int INVERSE = 1;
const int EXPONENTIAL = 2;
        
uniform vec3 colorInner;
uniform vec3 colorOuter;
uniform vec3 colorGain;
uniform int count;
uniform vec3 sourcePosition[MAX_DEBUG_SOURCES];
uniform vec3 sourceOrientation[MAX_DEBUG_SOURCES];
uniform float maxDistance[MAX_DEBUG_SOURCES];
uniform float refDistance[MAX_DEBUG_SOURCES];
uniform float rolloffFactor[MAX_DEBUG_SOURCES];
uniform int distanceModel[MAX_DEBUG_SOURCES];
uniform float coneInnerAngle[MAX_DEBUG_SOURCES];
uniform float coneOuterAngle[MAX_DEBUG_SOURCES];
uniform float gain[MAX_DEBUG_SOURCES];
uniform bool clipped[MAX_DEBUG_SOURCES];

const float kPi = 3.141592;
const float kDegToRad = kPi / 180.0;
const float kInvPi = 1.0 / 3.141592;
const float kRefDistWidth = 0.05;

float distance[MAX_DEBUG_SOURCES];
vec2 center[MAX_DEBUG_SOURCES];
float startOffset[MAX_DEBUG_SOURCES];
float clampedGain[MAX_DEBUG_SOURCES];

float att_linear(float x, float rolloff, float dref, float dmax) {
  return 1.0-(rolloff*((x-dref)/(dmax-dref)));
}

float att_inverse(float x, float rolloff, float dref) {
  return dref/(dref+(rolloff*(max(x, dref)-dref)));
}

float att_exponential(float x, float rolloff, float dref) {
  return pow((max(x, dref)/dref),-rolloff);
}

vec4 circle(vec2 center, float d, float len, float radius, float holeRadius, vec3 color, float offset) {  
  // Define how blurry the circle should be. 
  // A value of 1.0 means 'sharp', larger values
  // will increase the bluriness.
  float bluriness = 1.0;
  
  // Calculate angle, so we can draw segments, too.
  float angle = atan( center.x, center.y ) * kInvPi * 0.5;
  angle = fract( angle + offset);
  
  // Create an anti-aliased circle.
  float wd = bluriness * fwidth( d );
  float circle = smoothstep( radius + wd, radius - wd, d );
  
  // Optionally, you could create a hole in it:
  float inner = holeRadius;
  circle -= smoothstep( inner + wd, inner - wd, d );
  
  // Or only draw a portion (segment) of the circle.
  float wa = bluriness * fwidth( angle );
  float segment = smoothstep( len + wa, len - wa, angle );
  segment *= smoothstep( 0.0, 2.0 * wa, angle );
  circle *= mix( segment, 1.0, step( 1.0, len ) );
      
  // Let's define the circle's color now.
  vec3 rgb = color * circle;
  
  // Output final color.
  return vec4( rgb, circle);
}

float att(float d, float maxDistance, float refDistance, float rolloffFactor, int distanceModel) {
  // Calculate attenuation
  float attenuation = 1.0;
  if (distanceModel == LINEAR) {
    attenuation = att_linear(d, rolloffFactor, refDistance, maxDistance);
  } else if (distanceModel == INVERSE) {
    attenuation = att_inverse(d, rolloffFactor, refDistance);
  } else if (distanceModel == EXPONENTIAL) {
    attenuation = att_exponential(d, rolloffFactor, refDistance);
  }
  return clamp(attenuation, 0.0, 1.0);
}

vec4 draw_att(float d, float attenuation, vec4 circle) {
  // Waves
  float v = sin((d * 2.0 * kPi) - (time * 0.005)) + 1.0;
  float waves = circle.a * attenuation * v;
  
  // Output final color.
  return vec4( circle.rgb, waves );
}

void main() {
  // Draw background
  vec4 background = vec4(1.0, 1.0, 1.0, 0.0);

  for (int i=0; i<count; i++) {
    center[i] = sourcePosition[i].xz - vUv;

    // Calculate distance to (0,0).
    distance[i] = length( center[i] );

    // Optional start Offset.
    vec2 orientation = normalize(sourceOrientation[i].xz);
    float ang = atan(-orientation.x, orientation.y) * kInvPi * 0.5;
    // Rotate to start drawing facing front
    ang -= 0.5;
    startOffset[i] = mod(ang, 1.0);

    // Gain
    clampedGain[i] = clamp(gain[i], 0.0, 1.0);
  }

  for (int i=0; i<count; i++) {
    float attenuation = att(distance[i], maxDistance[i], refDistance[i], rolloffFactor[i], distanceModel[i]);

    // Draw inner cone
    float innerAngle = coneInnerAngle[i] * kDegToRad * kInvPi * 0.5;
    float innerStartAngle = startOffset[i] + innerAngle * 0.5;
    vec4 innerLayer = circle(center[i], distance[i], innerAngle, 10000.0, 1.0, colorInner, innerStartAngle);
    innerLayer = draw_att(distance[i], attenuation, innerLayer);
    background = mix(background, innerLayer, innerLayer.a * clampedGain[i]);

    // Draw outer cone
    float outerAngle = coneOuterAngle[i] * kDegToRad * kInvPi * 0.5;
    float outerAngleDiffHalf = (outerAngle - innerAngle) * 0.5;
    vec4 outerLayer1 = circle(center[i], distance[i], outerAngleDiffHalf, 10000.0, 1.0, colorOuter, innerStartAngle + outerAngleDiffHalf);
    outerLayer1 = draw_att(distance[i], attenuation, outerLayer1);
    background = mix(background, outerLayer1, outerLayer1.a * clampedGain[i]);
    vec4 outerLayer2 = circle(center[i], distance[i], outerAngleDiffHalf, 10000.0, 1.0, colorOuter, innerStartAngle - innerAngle);
    outerLayer2 = draw_att(distance[i], attenuation, outerLayer2);
    background = mix(background, outerLayer2, outerLayer2.a * (clipped[i] ? 0.0 : 1.0) * clampedGain[i]);
  }

  for (int i=0; i<count; i++) {
    // Draw base
    vec4 baseLayer = circle(center[i], distance[i], 1.0, 1.0, 0.1, vec3(0.5, 0.5, 0.5), 0.0);
    background = mix(background, baseLayer, baseLayer.a);

    // Draw gain
    vec4 gainLayer = circle(center[i], distance[i], clampedGain[i], 1.0, 0.5, colorGain, startOffset[i]);
    background = mix(background, gainLayer, gainLayer.a);
    if (gain[i] > 1.0) {
      vec4 overGainLayer = circle(center[i], distance[i], gain[i] -  clampedGain[i], 1.0, 0.5, vec3(1.0, 0.0, 0.0), startOffset[i]);
      background = mix(background, overGainLayer, overGainLayer.a);
    }
  } 
  
  // Blend
  gl_FragColor = vec4(background.rgb, background.a * vNormal.y);
}