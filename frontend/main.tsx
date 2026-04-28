import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { registerLappuiPwa } from './pwa'
import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Elemento #root nao encontrado para inicializar o frontend')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

registerLappuiPwa()
