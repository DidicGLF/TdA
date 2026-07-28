interface Props {
  imprime: boolean
  onToggle: () => void
  top: number
  left: number
}

// Pastille de décision d'impression, posée sur un champ pendant le mode « préparer l'impression ».
export default function PastilleImpression({ imprime, onToggle, top, left }: Props) {
  return (
    <div
      className="no-print"
      onClick={onToggle}
      title={imprime
        ? "Figure sur la version papier — cliquer pour l'exclure"
        : "Exclu de la version papier — cliquer pour l'inclure"}
      style={{
        position: 'absolute', top: `${top}%`, left: `${left}%`,
        transform: 'translate(-50%, -50%)', zIndex: 45, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: 9, fontSize: 10, lineHeight: 1,
        border: `1px solid ${imprime ? 'rgba(120,200,120,0.9)' : 'rgba(220,90,90,0.9)'}`,
        background: imprime ? 'rgba(30,80,30,0.92)' : 'rgba(90,25,25,0.92)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.5)', userSelect: 'none',
      }}
    >{imprime ? '🖨' : '🚫'}</div>
  )
}
