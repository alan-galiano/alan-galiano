export type Puesto = 'azafato' | 'radar' | 'consultor' | 'arquitecto' | 'fabrica'
export type EstadoTrabajo = 'trabajando' | 'listo' | 'cortado'
export type Trabajo = { agentId: string; puesto: Puesto; etiqueta: string; estado: EstadoTrabajo; ahora: string; usos: number; inicio: number; fin?: number }
export type Evento = { t: number; puesto: Puesto; etiqueta: string; texto: string }
export type Entregable = { puesto: Puesto; archivo: string; contenido: string; t: number }
export type Oficina = { negocio: string; carpeta: string; inicio: number; trabajos: Trabajo[]; feed: Evento[]; entregables: Entregable[]; acciones: number }

declare module 'claude-code' {
  interface PluginState {
    'mi-oficina': { oficina: Shaped<Oficina | null>; negocio: string }
  }
}
