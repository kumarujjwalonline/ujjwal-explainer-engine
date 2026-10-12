import React from 'react';
import type {Format, Scene} from '../types';
import {TitleCard} from './TitleCard';
import {Question} from './Question';
import {Points} from './Points';
import {Stat} from './Stat';
import {Timeline} from './Timeline';
import {Flow} from './Flow';
import {Compare} from './Compare';
import {Formula} from './Formula';
import {News} from './News';
import {ImageReveal} from './ImageReveal';
import {Hub} from './Hub';
import {MapScene} from '../geo/MapScene';

export const SceneVisual: React.FC<{scene: Scene; format: Format}> = ({scene}) => {
  const v = scene.visual;
  switch (v.type) {
    case 'title':
      return <TitleCard {...v} />;
    case 'question':
      return <Question {...v} />;
    case 'points':
      return <Points {...v} />;
    case 'stat':
      return <Stat {...v} />;
    case 'timeline':
      return <Timeline {...v} />;
    case 'flow':
      return <Flow {...v} />;
    case 'compare':
      return <Compare {...v} />;
    case 'formula':
      return <Formula {...v} />;
    case 'news':
      return <News {...v} />;
    case 'image':
      return <ImageReveal {...v} />;
    case 'hub':
      return <Hub {...v} />;
    case 'map':
      return <MapScene spec={v.map} />;
    default:
      return null;
  }
};
