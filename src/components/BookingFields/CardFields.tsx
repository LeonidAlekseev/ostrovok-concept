import { formatCardNumber, formatExpiry, type CardValues, type FormErrors } from '@/lib/booking'
import { TextField } from './TextField'

interface Props {
  card: CardValues
  onChange: (card: CardValues) => void
  errors: FormErrors
}

/** Demo card form: the values stay in the form state, nothing is stored or sent. */
export function CardFields({ card, onChange, errors }: Props) {
  const set = (change: Partial<CardValues>) => onChange({ ...card, ...change })
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <TextField
          id="card-number"
          label="Номер карты"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="4242 4242 4242 4242"
          value={card.number}
          onChange={(value) => set({ number: formatCardNumber(value) })}
          error={errors['card-number']}
        />
      </div>
      <TextField
        id="card-expiry"
        label="Срок действия"
        inputMode="numeric"
        autoComplete="cc-exp"
        placeholder="ММ/ГГ"
        value={card.expiry}
        onChange={(value) => set({ expiry: formatExpiry(value) })}
        error={errors['card-expiry']}
      />
      <TextField
        id="card-cvc"
        label="CVC"
        inputMode="numeric"
        autoComplete="cc-csc"
        maxLength={4}
        value={card.cvc}
        onChange={(value) => set({ cvc: value.replace(/\D/g, '') })}
        error={errors['card-cvc']}
      />
      <div className="sm:col-span-2">
        <TextField
          id="card-holder"
          label="Имя держателя"
          autoComplete="cc-name"
          placeholder="IVAN IVANOV"
          value={card.holder}
          onChange={(value) => set({ holder: value })}
          error={errors['card-holder']}
        />
      </div>
    </div>
  )
}
