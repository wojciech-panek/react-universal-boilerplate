import 'babel-polyfill';

import React from 'react';
import { Provider } from 'react-redux';
import { renderToString, renderToStaticMarkup } from 'react-dom/server';
import { createMemoryHistory, match, RouterContext } from 'react-router';
import { syncHistoryWithStore } from 'react-router-redux';
import { END } from 'redux-saga';
import Helmet from 'react-helmet';

import configureStore from './modules/store';
import routes from './routes';

import HtmlDocument from './htmlDocument';

import { selectLocationState } from './modules/router/router.selectors';
import monitorSagas from './utils/monitorSagas';

function renderAppToString(store, renderProps) {
  return renderToString(
    <Provider store={store}>
      <RouterContext {...renderProps} />
    </Provider>,
  );
}

async function renderHtmlDocument({ store, renderProps, sagasDone, assets, webpackDllNames }) {
  // 1st render phase - triggers the sagas
  renderAppToString(store, renderProps);

  // send signal to sagas that we're done
  store.dispatch(END);

  // wait for all tasks to finish
  await sagasDone();

  // capture the state after the first render
  const state = store.getState().toJS();

  // 2nd render phase - the sagas triggered in the first phase are resolved by now
  const appMarkup = renderAppToString(store, renderProps);

  const doc = renderToStaticMarkup(
    <HtmlDocument
      appMarkup={appMarkup}
      lang={state.locales.language}
      state={state}
      head={Helmet.rewind()}
      assets={assets}
      webpackDllNames={webpackDllNames}
    />
  );
  return `<!DOCTYPE html>\n${doc}`;
}

function is404(routes) {
  return routes.some((r) => r.name === 'notfound');
}

function renderAppToStringAtLocation(url, { webpackDllNames = [], assets, lang }, callback) {
  const memoryHistory = createMemoryHistory(url);
  const store = configureStore({}, memoryHistory);

  syncHistoryWithStore(memoryHistory, store, {
    selectLocationState: selectLocationState(),
  });

  const sagasDone = monitorSagas(store);

  match({ routes, location: url }, (error, redirectLocation, renderProps) => {
    if (error) {
      callback({ error });
    } else if (redirectLocation) {
      callback({ redirectLocation: redirectLocation.pathname + redirectLocation.search });
    } else if (renderProps) {
      renderHtmlDocument({ store, renderProps, sagasDone, assets, webpackDllNames })
        .then((html) => {
          const notFound = is404(renderProps.routes);
          callback({ html, notFound });
        })
        .catch((e) => callback({ error: e }));
    } else {
      callback({ error: new Error('Unknown error') });
    }
  });
}

export {
  renderAppToStringAtLocation,
};
