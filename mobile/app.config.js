// Mantém os dados de vínculo criados por `eas init` no app.json de cada equipe.
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'preview') return config;

  return {
    ...config,
    name: 'Marmitaria Teste',
    scheme: 'marmitaria-teste',
    android: {
      ...config.android,
      // Identificador exclusivo do APK de teste, sem definir o pacote de produção.
      package: 'com.ymlp.marmitaria.teste',
    },
    plugins: [
      ...(config.plugins ?? []),
      [
        'expo-build-properties',
        {
          android: {
            // A API local usa HTTP; esta permissão só entra no perfil preview.
            usesCleartextTraffic: true,
          },
        },
      ],
    ],
  };
};
