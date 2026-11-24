/**
 * src-shell/main.jsx — single React entry (replaces Vue src/main.js)
 */
import { createRoot } from 'react-dom/client'
import App from './App'
import '../src/styles/tokens.css'
import '../src/styles/base.css'

createRoot(document.getElementById('app')).render(<App />)
