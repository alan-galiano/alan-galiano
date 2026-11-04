import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Entregable, Evento, Oficina, Puesto, Trabajo } from '../types'

// La Oficina: cinco subagentes reales reciben a un negocio. Lo que muestra la pantalla
// (pantalla/index.html) sale de sus eventos: agent.spawn, tool.call y turn.complete.

const PLUGIN = 'mi-oficina'
const PANE = 'mi-oficina'
const TITLE = 'La Oficina'
const MAX_FEED = 200
const MAX_CONTENIDO = 14000

let BASE = ''

const oficina = atom({ plugin: 'mi-oficina', key: 'oficina' } as const, null as Oficina | null, { shape: 'oficina-1' })
const negocioAtom = atom({ plugin: 'mi-oficina', key: 'negocio' } as const, '')

const REGLAS = `Reglas que no se negocian:
- Leé y escribí solo dentro de la carpeta de trabajo que te indica el encargo.
- Usá solo lo que trajo el negocio y lo público de internet.
- Lo que falte, marcalo como "a confirmar".
- No recalcules ni inventes números: copiá los que estén en los materiales.
- Nunca mandes, publiques ni contactes a nadie.
- Escribí en español rioplatense, breve y claro, para gente de negocios.
- No escribas rutas de archivos ni carpetas dentro de los archivos que entregás.
- Tu respuesta final son dos líneas: qué hiciste y qué dejaste.`

type Def = { name: Puesto; nombre: string; description: string; tools: string[]; prompt: string }

const AGENTES: Def[] = [
  {
    name: 'azafato',
    nombre: 'Azafato',
    description: 'La Oficina: recibe a un negocio nuevo, lee sus materiales y deja su ficha.',
    tools: ['Read', 'Write', 'Glob'],
    prompt: `Sos el Azafato de La Oficina. Recibís a un negocio y armás su ficha.
Buscá los materiales del negocio en la carpeta que te indica el encargo. Empezá por el workbook si hay uno; después leé el resto.
No recalcules números: copiá los que encuentres tal cual.
Si no hay materiales, decilo en la ficha y marcá todo como "a confirmar".
Escribí ficha.md en la carpeta de la corrida con: qué es el negocio, qué vende, a quién, canales, números que trajo, problemas que menciona y qué falta saber.

${REGLAS}`,
  },
  {
    name: 'radar',
    nombre: 'Radar',
    description: 'La Oficina: investiga una fuente del negocio (Redes, Web o Materiales) y deja hasta 5 hallazgos.',
    tools: ['Read', 'Write', 'Glob', 'Grep', 'WebSearch'],
    prompt: `Sos el Radar de La Oficina. Investigás una sola fuente del negocio, la que te indica el encargo: Redes, Web o Materiales.
Leé primero ficha.md en la carpeta de la corrida.
- Redes: buscá en la web sus perfiles públicos (Instagram, Facebook, TikTok) y qué muestran.
- Web: buscá su sitio, reseñas, menciones y competencia cercana.
- Materiales: revisá los archivos que trajo el negocio, con Grep y Read.
Dejá hasta 5 hallazgos concretos, cada uno con de dónde sale.
Si el negocio no aparece en internet, decilo y mirá su rubro en su zona.
Escribí radar-<fuente>.md en la carpeta de la corrida, con la fuente en minúsculas: radar-redes.md, radar-web.md o radar-materiales.md.

${REGLAS}`,
  },
  {
    name: 'consultor',
    nombre: 'Consultor',
    description: 'La Oficina: encuentra los 3 problemas principales del negocio y arma un plan de 30 días.',
    tools: ['Read', 'Write', 'Glob'],
    prompt: `Sos el Consultor de La Oficina. Leé ficha.md y los radar-*.md de la carpeta de la corrida.
Encontrá los 3 problemas principales del negocio, cada uno con el dato que lo respalda, y armá un plan de 30 días.
Escribí dos archivos en la carpeta de la corrida:
1. diagnostico.md: los 3 problemas explicados y el plan semana por semana.
2. diagnostico.json, JSON válido y nada más, con esta forma exacta:
{"problemas":[{"titulo":"hasta 6 palabras","dato":"una frase"}],"plan":[{"cuando":"Semana 1","accion":"una frase"}]}
Exactamente 3 problemas y de 4 a 6 pasos de plan.

${REGLAS}`,
  },
  {
    name: 'arquitecto',
    nombre: 'Arquitecto',
    description: 'La Oficina: elige los 3 agentes que necesita el negocio y qué hace cada uno.',
    tools: ['Read', 'Write', 'Glob'],
    prompt: `Sos el Arquitecto de La Oficina. Leé ficha.md, los radar-*.md y diagnostico.md de la carpeta de la corrida.
Elegí exactamente 3 agentes para este negocio, cada uno con un nombre de una sola palabra, en español y sin tildes.
Para cada uno: qué hace, con qué datos trabaja, qué entrega y qué problema del diagnóstico ataca.
Escribí dos archivos en la carpeta de la corrida:
1. equipo.md: los 3 agentes explicados.
2. equipo.json, JSON válido y nada más, con esta forma exacta: {"agentes":[{"nombre":"..."}]}

${REGLAS}`,
  },
  {
    name: 'fabrica',
    nombre: 'Fábrica',
    description: 'La Oficina: prepara el plano y el prompt de un agente del equipo del negocio. Una vez por agente.',
    tools: ['Read', 'Write', 'Glob'],
    prompt: `Sos la Fábrica de La Oficina. Preparás el plano de un solo agente, el que te indica el encargo. No lo construís: dejás el punto de partida.
Leé ficha.md, diagnostico.md y equipo.md de la carpeta de la corrida.
Escribí dos archivos en la carpeta equipo/<nombre>/ dentro de la carpeta de la corrida, con el nombre en minúsculas y sin tildes:
1. prompt.md: el prompt del agente, con estas partes: rol, contexto, datos, tareas, formato de entrega y límites. La primera línea aclara que es el punto de partida: después hay que conectar herramientas, cargar datos reales, probar y ajustar.
2. ficha.json, JSON válido y nada más, con esta forma exacta:
{"nombre":"","que_hace":"","problema":"","que_hara":[],"que_no_hara":[],"necesita":[],"pasos":[]}
"problema" es por qué el negocio lo necesita; "necesita" es qué hay que conectarle (herramientas y datos); "pasos" son los pasos para construirlo.

${REGLAS}`,
  },
]

const PUESTOS = new Set<string>(AGENTES.map(a => a.name))

function puestoDe(subagentType: string): Puesto | null {
  if (!subagentType.startsWith(`${PLUGIN}:`)) return null
  const p = subagentType.slice(PLUGIN.length + 1)
  return PUESTOS.has(p) ? (p as Puesto) : null
}

export function carpetaDe(negocio: string): string {
  return negocio
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function fechaHora(ms: number): string {
  const d = new Date(ms)
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}`
}

function archivoDe(ruta: string): string {
  return ruta.split('/').pop() ?? ruta
}

export function ahoraDe(tool: string, input: Record<string, unknown>): string {
  const ruta = typeof input.file_path === 'string' ? input.file_path : typeof input.path === 'string' ? input.path : ''
  if (tool === 'Read') return ruta ? `Leyendo ${archivoDe(ruta)}` : 'Leyendo materiales'
  if (tool === 'Write') return ruta ? `Escribiendo ${archivoDe(ruta)}` : 'Escribiendo'
  if (tool === 'Glob') return 'Revisando la carpeta'
  if (tool === 'Grep') return 'Buscando en los materiales'
  if (tool === 'WebSearch') return typeof input.query === 'string' ? `Buscando en la web: ${input.query.slice(0, 60)}` : 'Buscando en la web'
  if (tool === 'SubagentHandback') return 'Entregando su informe'
  return 'Trabajando'
}

const nombreDe = (p: Puesto) => AGENTES.find(a => a.name === p)?.nombre ?? p

async function publicar($: EngineInterface, o: Oficina | null): Promise<void> {
  if (!BASE) return
  const json = JSON.stringify(o).replace(/</g, '\\u003c')
  await $.fs.write(`${BASE}/pantalla/estado.js`, `window.__OFICINA__=${json};`)
}

async function cambiar($: EngineInterface, fn: (o: Oficina) => Oficina): Promise<void> {
  let nuevo: Oficina | null = null
  await update($, oficina, o => {
    if (!o) return o
    nuevo = fn(o)
    return nuevo
  })
  if (nuevo) await publicar($, nuevo)
}

const conEvento = (o: Oficina, ev: Evento): Evento[] => [...o.feed, ev].slice(-MAX_FEED)

function recorrido(negocio: string, corrida: string, materiales: string): string {
  return `La Oficina recibe a "${negocio}". Coordiná el recorrido sin hacer vos el trabajo de ningún agente y sin escribirle a la persona entre etapas.

Carpeta de la corrida: ${corrida}
Materiales del negocio: ${materiales}

Cada encargo que mandes dice el negocio ("${negocio}"), la carpeta de la corrida y la carpeta de materiales de arriba.

1. Abrí la pantalla con Bash: open "${BASE}/pantalla/index.html"
2. Lanzá un agente mi-oficina:azafato con description "Recepción" y esperá a que termine.
3. Lanzá tres agentes mi-oficina:radar en un mismo mensaje, uno por fuente, con description "Redes", "Web" y "Materiales", y esperá a los tres.
4. Lanzá un agente mi-oficina:consultor con description "Diagnóstico" y esperá.
5. Lanzá un agente mi-oficina:arquitecto con description "Diseño" y esperá.
6. Leé equipo.json en la carpeta de la corrida. Lanzá un agente mi-oficina:fabrica por cada agente elegido, todos en un mismo mensaje, con description igual a su nombre, y esperá a todos.
7. Cerrá con una sola línea: "${negocio} ya tiene el plano de su equipo." y los tres nombres.`
}

async function prepararCorrida($: EngineInterface, crudo: string): Promise<string> {
  const negocio = crudo.replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!negocio) return 'Falta el nombre del negocio.'
  if (!BASE) BASE = await $.session.root()
  const inicio = await $.clock.now()
  const slug = carpetaDe(negocio) || 'negocio'
  const corrida = `${BASE}/clientes/${slug}/${fechaHora(inicio)}`
  const materiales = `${BASE}/materiales/${slug}/`
  const o: Oficina = { negocio, carpeta: corrida, inicio, trabajos: [], feed: [], entregables: [], acciones: 0 }
  await update($, oficina, () => o)
  await publicar($, o)
  return recorrido(negocio, corrida, materiales)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    BASE = await $.session.root()
    await update($, oficina, () => null)
    await $.fs.write(`${BASE}/pantalla/estado.js`, 'window.__OFICINA__=null;').catch(() => undefined)
    await Promise.all(
      AGENTES.map(a =>
        $.agent.register({
          name: a.name,
          description: a.description,
          prompt: a.prompt,
          tools: a.tools,
          model: 'sonnet',
          omitClaudeMd: true,
          permissionMode: 'acceptEdits',
          maxTurns: 15,
        }),
      ),
    )
    await $.tool.register({
      name: 'oficina_arrancar',
      description:
        'Usala cuando la persona diga: Llegó un negocio nuevo: <nombre>. Hace entrar al negocio a La Oficina y devuelve el recorrido de agentes que tenés que seguir, sin leer antes sus archivos.',
      inputSchema: {
        type: 'object',
        properties: { negocio: { type: 'string', description: 'El nombre del negocio, como lo dijo la persona' } },
        required: ['negocio'],
      },
      isDeferred: false,
    })
    await $.command.register({ name: 'mi-oficina', description: 'Abre La Oficina: el panel para hacer entrar a un negocio' })
    return next(e)
  })

  on('command.run', { command: 'mi-oficina' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'La Oficina está abierta.' }
  })

  on('tool.call', { tool: 'mcp__mi-oficina__oficina_arrancar' }, async ($, e) => {
    try {
      const pedido = e as unknown as { negocio?: unknown }
      const negocio = typeof pedido.negocio === 'string' ? pedido.negocio : ''
      return { result: await prepararCorrida($, negocio) }
    } catch (error) {
      return { result: `La Oficina no pudo arrancar: ${String(error)}` }
    }
  })

  on('agent.spawn', async ($, e, next) => {
    const puesto = puestoDe(e.subagentType)
    if (!puesto) return next(e)
    if (!BASE) BASE = await $.session.root()
    const hecho = await next({ ...e, cwd: BASE })
    const agentId = hecho.agentId
    if (agentId) {
      const inicio = await $.clock.now()
      const etiqueta = e.description || nombreDe(puesto)
      const nuevo: Trabajo = { agentId, puesto, etiqueta, estado: 'trabajando', ahora: 'Arrancando', usos: 0, inicio }
      await cambiar($, o => ({
        ...o,
        trabajos: [...o.trabajos, nuevo],
        feed: conEvento(o, { t: inicio, puesto, etiqueta, texto: 'Se puso a trabajar' }),
      }))
    }
    return hecho
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    const o = id ? await read($, oficina) : null
    const trabajo = o?.trabajos.find(t => t.agentId === id)
    if (!id || !trabajo) return next(e)
    const input = e as unknown as Record<string, unknown>
    const texto = ahoraDe(e.tool, input)
    const t = await $.clock.now()
    await cambiar($, of => ({
      ...of,
      acciones: of.acciones + 1,
      trabajos: of.trabajos.map(x => (x.agentId === id ? { ...x, ahora: texto, usos: x.usos + 1 } : x)),
      feed: conEvento(of, { t, puesto: trabajo.puesto, etiqueta: trabajo.etiqueta, texto }),
    }))
    const hecho = await next(e)
    if (e.tool === 'Write' && hecho.deny === undefined && hecho.isError !== true) {
      const ruta = typeof input.file_path === 'string' ? input.file_path : ''
      const contenido = typeof input.content === 'string' ? input.content.slice(0, MAX_CONTENIDO) : ''
      if (ruta) {
        const fin = await $.clock.now()
        await cambiar($, of => {
          const archivo = ruta.startsWith(`${of.carpeta}/`) ? ruta.slice(of.carpeta.length + 1) : archivoDe(ruta)
          const nuevo: Entregable = { puesto: trabajo.puesto, archivo, contenido, t: fin }
          return { ...of, entregables: [...of.entregables.filter(x => x.archivo !== archivo), nuevo] }
        })
      }
    }
    return hecho
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const o = await read($, oficina)
    if (o && e.agentId) {
      const quien = o.trabajos.find(t => t.agentId === e.agentId)
      if (quien && quien.estado === 'trabajando') {
        const estado = e.reason === 'answer' ? 'listo' : 'cortado'
        const fin = await $.clock.now()
        await cambiar($, of => ({
          ...of,
          trabajos: of.trabajos.map(t =>
            t.agentId === e.agentId ? { ...t, estado, fin, ahora: estado === 'listo' ? 'Terminó' : 'Se cortó' } : t,
          ),
          feed: conEvento(of, { t: fin, puesto: quien.puesto, etiqueta: quien.etiqueta, texto: estado === 'listo' ? 'Terminó su parte' : 'Se cortó' }),
        }))
      }
    } else if (o && !e.agentId && o.trabajos.some(t => t.estado === 'trabajando')) {
      const muertos = new Set(['completed', 'failed', 'killed'])
      const vivos = new Set((await $.agent.list()).filter(a => !muertos.has(a.status)).map(a => a.id))
      const fin = await $.clock.now()
      await cambiar($, of => ({
        ...of,
        trabajos: of.trabajos.map(t =>
          t.estado === 'trabajando' && !vivos.has(t.agentId) ? { ...t, estado: 'cortado', fin, ahora: 'Se cortó' } : t,
        ),
      }))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const o = await read($, oficina)
    const negocio = await read($, negocioAtom)

    const entrar = async () => {
      const nombre = (await read($, negocioAtom)).trim()
      if (!nombre) {
        await $.ui.toast('Escribí el nombre del negocio')
        return
      }
      const texto = await prepararCorrida($, nombre)
      void $.prompt.submit({ text: texto })
    }

    const marca = { trabajando: '⏳', listo: '✓', cortado: '⚠️' } as const

    return (
      <Box flexDirection="column" gap={1}>
        {'Input' in ui && (
          <ui.Input
            key="negocio"
            label="Negocio"
            value={negocio}
            placeholder="Nombre del negocio"
            onInput={texto => update($, negocioAtom, () => texto)}
            onSubmit={() => entrar()}
            submitLabel="entrar"
          />
        )}
        <Button key="entrar" label="Hacer entrar al cliente" onPress={() => entrar()} />
        {!o && <Text dimColor>Lista para recibir al próximo negocio.</Text>}
        {o && <Text bold>{o.negocio}</Text>}
        {o && o.trabajos.length === 0 && <Text dimColor>Esperando al primer agente.</Text>}
        {o?.trabajos.map(t => (
          <Text key={t.agentId} dimColor={t.estado !== 'trabajando'}>
            {marca[t.estado]} {nombreDe(t.puesto)} · {t.etiqueta}: {t.ahora}
          </Text>
        ))}
      </Box>
    )
  })
}
