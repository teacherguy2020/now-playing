'use strict';

const Alexa = require('ask-sdk-core');

function createMiscHandlers({ VERSION }) {
  const LogRequestInterceptor = {
    process(handlerInput) {
      try {
        const req = handlerInput.requestEnvelope && handlerInput.requestEnvelope.request;
        const t = req && req.type ? req.type : 'unknown';

        console.log('INCOMING request.type:', t);
        console.log('VERSION:', VERSION);

        if (t === 'IntentRequest') {
          const intentName = req && req.intent && req.intent.name ? req.intent.name : 'unknown';
          const slots = req && req.intent && req.intent.slots ? req.intent.slots : null;
          console.log('INCOMING intent.name:', intentName);
          if (slots) console.log('INCOMING intent.slots:', JSON.stringify(slots));
        }
      } catch (e) {
        console.log('LogRequestInterceptor failed:', e && e.message ? e.message : String(e));
      }
    },
  };

  const SystemExceptionHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'System.ExceptionEncountered';
    },
    handle(handlerInput) {
      try {
        const req = handlerInput.requestEnvelope && handlerInput.requestEnvelope.request;
        const cause = req && req.error && req.error.cause ? req.error.cause : null;
        const msg = req && req.error && req.error.message ? req.error.message : '';
        console.log('System.ExceptionEncountered', msg ? ('message=' + msg) : '');
        if (cause) console.log('System.Exception cause:', JSON.stringify(cause));
        else console.log('System.Exception payload:', JSON.stringify(req || {}));
      } catch (e) {
        console.log('System.ExceptionEncountered (logging failed):', e && e.message ? e.message : String(e));
      }
      return handlerInput.responseBuilder.getResponse();
    },
  };

  const ErrorHandler = {
    canHandle() { return true; },
    handle(handlerInput, error) {
      console.log('ErrorHandler:', error && error.message ? error.message : String(error));
      return handlerInput.responseBuilder.getResponse();
    },
  };

  return { LogRequestInterceptor, SystemExceptionHandler, ErrorHandler };
}

module.exports = { createMiscHandlers };
