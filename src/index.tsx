import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { completeAuthPopupIfPresent } from './utils/genesysCloudUtils';

// If this window is the Genesys Cloud auth popup redirected back with an auth
// result, relay it to the opener and close — do not render the dashboard here.
if (completeAuthPopupIfPresent()) {
  // Running inside the auth popup; stop before rendering the app.
} else {
  ReactDOM.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
    document.getElementById('root')
  );

  // If you want to start measuring performance in your app, pass a function
  // to log results (for example: reportWebVitals(console.log))
  // or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
  reportWebVitals();
}
