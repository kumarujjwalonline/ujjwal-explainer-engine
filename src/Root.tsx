import React from 'react';
import {Composition, Still} from 'remotion';
import {Explainer, totalFrames} from './Explainer';
import {Thumbnail} from './Thumbnail';
import {FPS, size} from './theme';
import type {Job, RenderProps} from './types';
import sample from '../samples/sample-job.json';

const sampleJob = sample as unknown as Job;

export const Root: React.FC = () => (
  <>
    <Composition
      id="Explainer"
      component={Explainer}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={300}
      defaultProps={{job: sampleJob, format: '16:9'} as RenderProps}
      calculateMetadata={({props}) => ({
        durationInFrames: Math.max(1, totalFrames(props)),
        ...size(props.format),
      })}
    />
    <Still
      id="Thumbnail"
      component={Thumbnail}
      width={1280}
      height={720}
      defaultProps={{job: sampleJob}}
    />
  </>
);
