import type { ShaderModuleDef } from '../core/types';
import blankCanvas from './blank-canvas';
import alienBio from './alien-bio';
import crystalKifs from './crystal-kifs';
import cyberDystopia from './cyber-dystopia';
import cyberscape from './cyberscape';
import feedbackLoop from './feedback-loop';
import glitchTvPro from './glitch-tv-pro';
import liquidGold from './liquid-gold';
import quantumCore from './quantum-core';
import webcamInput from './webcam-input';
import wormholeX from './wormhole-x';

export const BUILTIN_SHADERS: ShaderModuleDef[] = [
  blankCanvas,
  crystalKifs,
  liquidGold,
  cyberDystopia,
  alienBio,
  quantumCore,
  wormholeX,
  cyberscape,
  glitchTvPro,
  feedbackLoop,
  webcamInput,
];
