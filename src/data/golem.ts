export type GolemAmeliorationKey =
  | 'arme2mains'
  | 'armureRenforcee'
  | 'formeBestiale'
  | 'impulsion'
  | 'protectionRunique'
  | 'puissant'
  | 'tailleSuperieure'

export const GOLEM_AMELIORATIONS_LIST: { cle: GolemAmeliorationKey; type: 'stat' | 'texte' }[] = [
  { cle: 'arme2mains',        type: 'stat'  },
  { cle: 'armureRenforcee',   type: 'stat'  },
  { cle: 'formeBestiale',     type: 'stat'  },
  { cle: 'impulsion',         type: 'texte' },
  { cle: 'protectionRunique', type: 'texte' },
  { cle: 'puissant',          type: 'stat'  },
  { cle: 'tailleSuperieure',  type: 'stat'  },
]

export const GOLEM_BASE = {
  def: 14,
  forMod: 3,
  dexMod: 0,
  conMod: 2,
  intMod: -3,
  sagMod: 0,
  chaMod: -3,
  init: 10,
}
