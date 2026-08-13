import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-switch'
export const inject = ['tools', 'llm', 'agentDefaultModel']

function renderJson(_args, value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

function failureMessage(error) {
  const code = typeof error?.code === 'string' ? error.code : 'ERROR'
  const message = error instanceof Error ? error.message : String(error)
  return { code, message }
}

export function createDefinitions(ctx) {
  const status = defineTool({
    name: 'dsh_switch_status',
    description: 'Show the default model for new DSH sessions and the currently registered provider routes. This does not probe provider networks.',
    parameters: {
      includeModels: {
        type: 'boolean',
        description: 'When true, query each registered adapter for its advertised model catalog.'
      }
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      const current = ctx.agentDefaultModel.currentSelection()
      const providers = ctx.llm.listProviders().map(provider => ({
        id: provider.id,
        name: provider.name,
        description: provider.description
      }))
      if (args.includeModels !== true) return { current, providers }

      const withModels = await Promise.all(providers.map(async provider => {
        try {
          const models = await ctx.llm.listModels(provider.id)
          return {
            ...provider,
            models: models.map(model => ({
              id: model.id,
              name: model.name,
              inputModalities: model.inputModalities
            }))
          }
        } catch (error) {
          return { ...provider, models: [], catalogError: failureMessage(error) }
        }
      }))
      return { current, providers: withModels }
    }
  })

  const switchDefault = defineTool({
    name: 'dsh_switch_default',
    description: 'Validate a registered provider/model route and save it as the default for NEW DSH sessions. Existing sessions keep their logged model. Optional expectedProvider/expectedModel provide optimistic concurrency.',
    parameters: {
      provider: { type: 'string', required: true, description: 'Registered DSH provider route id.' },
      model: { type: 'string', required: true, description: 'Exact adapter-owned model id.' },
      reasoningEffort: { type: 'string', description: 'Optional adapter-owned reasoning effort id.' },
      expectedProvider: { type: 'string', description: 'Refuse if the current default provider differs.' },
      expectedModel: { type: 'string', description: 'Refuse if the current default model differs.' }
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args, execution) {
      if ((args.expectedProvider === undefined) !== (args.expectedModel === undefined)) {
        throw new Error('expectedProvider and expectedModel must be supplied together')
      }
      const previous = ctx.agentDefaultModel.currentSelection()
      if (args.expectedProvider !== undefined
        && (previous.provider !== args.expectedProvider || previous.model !== args.expectedModel)) {
        const error = new Error(`default model changed: expected ${args.expectedProvider}/${args.expectedModel}, found ${previous.provider}/${previous.model}`)
        error.code = 'STALE_DEFAULT_MODEL'
        throw error
      }

      const info = await ctx.llm.resolveModelInfo(args.provider, args.model, execution.signal)
      if (args.reasoningEffort !== undefined) {
        const efforts = info.reasoning?.efforts ?? []
        if (!efforts.some(effort => effort.id === args.reasoningEffort)) {
          const error = new Error(`reasoning effort "${args.reasoningEffort}" is not advertised by ${args.provider}/${args.model}`)
          error.code = 'UNSUPPORTED_REASONING_EFFORT'
          throw error
        }
      }
      const requested = {
        provider: args.provider,
        model: args.model,
        ...(args.reasoningEffort === undefined ? {} : { reasoningEffort: args.reasoningEffort })
      }
      await ctx.agentDefaultModel.saveSelection(requested)
      const current = ctx.agentDefaultModel.currentSelection()
      if (current.provider !== requested.provider
        || current.model !== requested.model
        || current.reasoningEffort !== requested.reasoningEffort) {
        const error = new Error('default model write did not become observable')
        error.code = 'WRITE_NOT_OBSERVED'
        throw error
      }
      return {
        previous,
        current,
        resolved: {
          provider: info.provider,
          id: info.id,
          name: info.name,
          inputModalities: info.inputModalities,
          contextWindow: info.context?.contextWindow,
          reasoningEfforts: info.reasoning?.efforts?.map(effort => effort.id) ?? []
        },
        effect: 'new-sessions-only'
      }
    }
  })

  return [status, switchDefault]
}

export function apply(ctx) {
  for (const definition of createDefinitions(ctx)) ctx.tools.register(definition)
}

