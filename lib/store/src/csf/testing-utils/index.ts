import {
  isExportStory,
  AnyFramework,
  AnnotatedStoryFn,
  StoryAnnotations,
  ComponentAnnotations,
  ProjectAnnotations,
  Args,
  StoryContext,
  Parameters,
} from '@storybook/csf';

import { prepareStory } from '../prepareStory';
import { normalizeStory } from '../normalizeStory';
import { HooksContext } from '../../hooks';
import { normalizeComponentAnnotations } from '../normalizeComponentAnnotations';
import { getValuesFromArgTypes, normalizeProjectAnnotations } from '..';
import type { CSFExports, TestingStoryPlayFn } from './types';

export * from './types';

if (process.env.NODE_ENV === 'test') {
  // eslint-disable-next-line global-require
  const { default: addons, mockChannel } = require('@storybook/addons');
  addons.setChannel(mockChannel());
}

let GLOBAL_STORYBOOK_PROJECT_ANNOTATIONS = {};

export function setGlobalConfig<TFramework extends AnyFramework = AnyFramework>(
  projectAnnotations: ProjectAnnotations<TFramework>
) {
  GLOBAL_STORYBOOK_PROJECT_ANNOTATIONS = projectAnnotations;
}

interface ComposeStory<TFramework extends AnyFramework = AnyFramework, TArgs extends Args = Args> {
  (
    storyAnnotations: AnnotatedStoryFn<TFramework, TArgs> | StoryAnnotations<TFramework, TArgs>,
    componentAnnotations: ComponentAnnotations<TFramework, TArgs>,
    projectAnnotations: ProjectAnnotations<TFramework>,
    exportsName?: string
  ): {
    (extraArgs: Partial<TArgs>): TFramework['storyResult'];
    storyName: string;
    args: Args;
    play: TestingStoryPlayFn;
    parameters: Parameters;
  };
}

export function composeStory<
  TFramework extends AnyFramework = AnyFramework,
  TArgs extends Args = Args
>(
  storyAnnotations: AnnotatedStoryFn<TFramework, TArgs> | StoryAnnotations<TFramework, TArgs>,
  componentAnnotations: ComponentAnnotations<TFramework, TArgs>,
  projectAnnotations: ProjectAnnotations<TFramework> = GLOBAL_STORYBOOK_PROJECT_ANNOTATIONS,
  defaultConfig: ProjectAnnotations<TFramework> = {},
  exportsName?: string
) {
  if (storyAnnotations === undefined) {
    throw new Error('Expected a story but received undefined.');
  }

  const normalizedComponentAnnotations = normalizeComponentAnnotations(componentAnnotations);

  const storyExportsName =
    exportsName ||
    storyAnnotations.storyName ||
    storyAnnotations.story?.name ||
    storyAnnotations.name;

  const normalizedStory = normalizeStory(
    storyExportsName,
    storyAnnotations,
    normalizedComponentAnnotations
  );

  const normalizedProjectAnnotations = normalizeProjectAnnotations({
    ...projectAnnotations,
    ...defaultConfig,
  });

  const story = prepareStory<TFramework>(
    normalizedStory,
    normalizedComponentAnnotations,
    normalizedProjectAnnotations
  );

  const defaultGlobals = getValuesFromArgTypes(projectAnnotations.globalTypes);

  const composedStory = (extraArgs: Partial<TArgs>) => {
    const context: Partial<StoryContext> = {
      ...story,
      hooks: new HooksContext(),
      globals: defaultGlobals,
      args: { ...story.initialArgs, ...extraArgs },
    };

    return story.unboundStoryFn(context as StoryContext);
  };

  composedStory.storyName = storyAnnotations.storyName || storyAnnotations.name;
  composedStory.args = story.initialArgs;
  composedStory.play = story.playFunction as TestingStoryPlayFn;
  composedStory.parameters = story.parameters;

  return composedStory;
}

export function composeStories<TModule extends CSFExports>(
  storiesImport: TModule,
  globalConfig: ProjectAnnotations<AnyFramework>,
  composeStoryFn: ComposeStory
) {
  const { default: meta, __esModule, __namedExportsOrder, ...stories } = storiesImport;
  const composedStories = Object.entries(stories).reduce((storiesMap, [exportsName, story]) => {
    if (!isExportStory(exportsName, meta)) {
      return storiesMap;
    }

    const result = Object.assign(storiesMap, {
      [exportsName]: composeStoryFn(story, meta, globalConfig, exportsName),
    });
    return result;
  }, {});

  return composedStories;
}