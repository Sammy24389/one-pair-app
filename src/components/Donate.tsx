import {Copy, Heart} from 'lucide-react'
import {toast} from '../lib/notify'

const PAYPAL = 'ssuvamm@gmail.com'
const UPI = 'ssuvamm@oksbi'

// Standard PayPal checkout (not the Donate flow, which isn't available in every country). The payer enters the amount.
const PAYPAL_URL = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(PAYPAL)}&item_name=${encodeURIComponent('Support OnePair')}&currency_code=USD&no_shipping=1`
const UPI_URL = `upi://pay?pa=${UPI}&pn=OnePair&cu=INR&tn=${encodeURIComponent('Support OnePair')}`

const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast({title: 'Copied'}))

const Method = ({title, id, label, href, cta}: {title: string; id: string; label: string; href: string; cta: string}) => (
  <div className="list-row">
    <div className="grow">
      <div style={{fontWeight: 600}}>{title}</div>
      <div className="tiny muted">{id}</div>
    </div>
    <button className="btn ghost sm" aria-label={`Copy ${label}`} onClick={() => copy(id)}>
      <Copy size={16} />
    </button>
    <a className="btn sm" href={href} target="_blank" rel="noopener noreferrer">
      <Heart size={16} /> {cta}
    </a>
  </div>
)

export const Donate = ({style}: {style?: React.CSSProperties}) => (
  <div className="card" style={style}>
    <h3>Support OnePair</h3>
    <p className="tiny muted">OnePair is free, ad-free and open source. If it makes your days a little warmer, you can buy the developer a coffee ☕</p>
    <Method title="PayPal" id={PAYPAL} label="PayPal email" href={PAYPAL_URL} cta="Pay" />
    <Method title="UPI (India)" id={UPI} label="UPI ID" href={UPI_URL} cta="Pay" />
  </div>
)
