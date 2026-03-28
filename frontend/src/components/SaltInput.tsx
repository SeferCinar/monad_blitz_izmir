import { generateRandomBytes32 } from '../lib/crypto'

type Props = {
  value: string
  onChange: (v: string) => void
  label?: string
}

export default function SaltInput({ value, onChange, label = 'Salt' }: Props) {
  const handleGenerate = () => {
    onChange(generateRandomBytes32())
  }

  return (
    <div className="flex-1">
      {label && <label className="mb-1 block text-xs text-gray-500">{label}</label>}
      <div className="flex gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0x... (bytes32)"
          className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 font-mono placeholder-gray-600 focus:border-purple-500 focus:outline-none"
          readOnly
        />
        <button
          type="button"
          onClick={handleGenerate}
          title="Rastgele salt uret"
          className="rounded-lg bg-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-600 hover:text-white"
        >
          Uret
        </button>
      </div>
    </div>
  )
}
