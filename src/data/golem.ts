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
  forMod: 1,
  dexMod: -1,
  conMod: 10,
  intMod: -4,
  sagMod: -3,
  chaMod: -4,
}
