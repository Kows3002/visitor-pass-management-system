import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './responsive.css'
import './management.css'
import './dashboard.css'
import './registration.css'
import './registration-fixes.css'
import './workflow.css'
import './gate.css'
import './reports.css'
import './activity.css'
import './polish.css'
import './management-empty.css'
import './activity-refinement.css'
import './login.css'
import './enterprise.css'
import App from './App.jsx'
import { Provider } from 'react-redux'
import { store } from './store'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}><App /></Provider>
  </StrictMode>,
)
