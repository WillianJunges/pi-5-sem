# Orientações de contribuição

## Antes de iniciar

1. Escolha a tarefa atribuída a você no Trello e confira o escopo, as dependências e os critérios de entrega.
2. Utilize a VM preparada por William, conforme as orientações documentadas pela equipe.
3. Configure a identidade Git com os seus próprios dados. Em uma VM compartilhada, prefira a configuração local do repositório e confira a identidade antes de cada commit:

```sh
git config --local user.name "Seu nome"
git config --local user.email "Email associado à sua conta GitHub"
git config --local --get user.name
git config --local --get user.email
```

A identidade do autor e a conta usada para autenticar o envio são configurações distintas. Utilize as suas próprias credenciais de acesso; não inclua credenciais em commits ou documentação.

## Para cada atividade

1. Implemente o escopo definido no card.
2. Execute testes unitários que validem o comportamento e encontrem falhas.
3. Corrija os problemas encontrados e repita os testes pertinentes.
4. Atualize a documentação necessária e registre as evidências da entrega no card.
5. Confira os arquivos alterados e realize o commit com sua identidade Git.

Todos os integrantes devem ter participação efetiva por meio dos commits das suas próprias atividades, conforme requisito do professor.

As ferramentas de teste, comandos de execução e regras de integração serão documentados após a definição da arquitetura.
