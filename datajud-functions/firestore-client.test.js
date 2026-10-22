import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, getApps, getApp, deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {obterBanco} from './firestore-client.js';

test('inicializa o app padrão mesmo quando a autenticação já criou um app interno', async()=>{
  // Apenas instancia os SDKs; não faz consultas, autenticação ou escrita na rede.
  process.env.FIREBASE_CONFIG = JSON.stringify({projectId:'demo-datajud-crm'});
  const interno = initializeApp({projectId:'demo-datajud-crm'}, '__admin__');
  try {
    assert.equal(getApps().length, 1);
    assert.throws(()=>getFirestore(), {code:'app/no-app'});
    const banco = await obterBanco();
    assert.equal(getApp().name, '[DEFAULT]');
    assert.equal(banco, getFirestore(getApp()));
    assert.equal(await obterBanco(), banco);
    assert.equal(getApps().length, 2);
  } finally {
    await Promise.all(getApps().map(app=>deleteApp(app)));
    delete process.env.FIREBASE_CONFIG;
  }
});
