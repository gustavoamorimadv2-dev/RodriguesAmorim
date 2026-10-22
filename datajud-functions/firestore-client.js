// A verificação do login pode criar um app interno nomeado no Firebase Admin.
// A existência desse app não significa que o app [DEFAULT] foi inicializado.
let banco;
export async function obterBanco() {
  if (banco) return banco;
  const [admin, firestore] = await Promise.all([import('firebase-admin/app'), import('firebase-admin/firestore')]);
  const app = admin.getApps().find(app => app.name === '[DEFAULT]') || admin.initializeApp();
  // Passa o app explicitamente; não depende do registro padrão de outro módulo.
  banco = firestore.getFirestore(app);
  return banco;
}
