# Monitoramento ponta-a-ponta: visualizando jornada de uma requisição no DataDog

Um dos maiores desafios na coleta de métricas e tracing é a visualização ponta-a-ponta (end-to-end), relacionando uma ação do usuário no frontend (app ou site) diretamente com a execução de uma função no backend.

Essa falta de visibilidade pode gerar inúmeros problemas como, por exemplo, não ser capaz de ver indicadores sobre impacto em cima de clientes a partir de determinada versão de um serviço, não conseguir identificar pontos de frustração, não conseguir recriar condições de um erro para realizar um debug em um problema específico e assim por diante.

Para resolver esse problema, podemos usar o DataDog, um SaaS de observabilidade relativamente fácil de usar e com centenas de integrações. Vamos usar o formato de propagação `baggage`, definido no padrão do W3C como um header que representa um conjunto de propriedades definidas pelo usuário associadas com uma requisição distribuida.

## Recursos

Para fazer os testes de tracing ponta-a-ponta com o DataDog, utilizei os seguintes repositórios:

- [pokelogger](https://github.com/kamuridesu/pokelogger/tree/a1c2b2ab7ccb75cc11271ee9128b0820e37c68fb)
- [java-dd-test](https://github.com/kamuridesu/java-dd-test-full-tracing/tree/928656834e9f6a63ad2b10336b01e733289362d3)
- [argocd-apps-test-helm](https://github.com/kamuridesu/argocd-apps-test-helm/tree/51e27136be2151c2f5c38c4630f2062e7fb59cb5)

Os links acima estão apontando para uma commit relacionada aos tracings, então em caso de alteração futura nos projetos essa documentação continuará relevante.

## Configurando o frontend

O frontend usado como exemplo foi uma aplicação criada com Python/Quart, onde o frontend é construido a partir de templates Jinja2. Fora as tecnicalidades do Jinja2, a mesma configuração funcionará com qualquer página HTML/JavaScript.

Para fazer a instrumentação no frontend de forma manual, foi criado o app no RUM do DataDog (lá contém uma explicação fácil de seguir para essa configuração). Depois disso, adicionei uma tag `<script>` no head do HTML. Nas configurações de instrumentação, depois de configurar com suas preferências, foi adicionado o seguinte:

```js
allowedTracingUrls: [/^\//, window.location.origin];
```

Isso vai permitir que o DataDog monitore requisições para correlacionar os traces com eventos de RUM. Isso por si só já torna possível a visualização do Flame Graph com informações da jornada da requisição, todavia não temos um campo de span para fazer a pesquisa e correlacionar essas informações em dashboards, por exemplo.

Para que seja possível pesquisar e correlacionar spans dentro dos traces, podemos enviar um header que será propagado em todas as requisições. No exemplo abaixo, foi criado um wrapper em cima da função `window.fetch`, enviando um header customizado "baggage: correlation_id=valor_aleatorio" em todas as requisições para o backend:

```js
const originalFetch = window.fetch;
const accessId = crypto.randomUUID();

if (window.DD_RUM && window.DD_RUM.setGlobalContextProperty) {
  window.DD_RUM.setGlobalContextProperty("correlation_id", accessId);
}

(async () => {
  window.fetch = async (...args) => {
    let [resource, config] = args;

    config = config || {};

    const baggageKey = "baggage";
    const baggageValue = "correlation_id=" + accessId;

    if (!config.headers) {
      config.headers = {};
    }

    let urlString = resource;
    if (resource instanceof Request) {
      urlString = resource.url;
    }

    const isInternalRequest =
      urlString.toString().startsWith("/") ||
      urlString.toString().includes("tools.kamuridesu.com") ||
      urlString.toString().includes("localhost");

    if (isInternalRequest) {
      if (config.headers instanceof Headers) {
        config.headers.set(baggageKey, baggageValue);
      } else {
        config.headers[baggageKey] = baggageValue;
      }
    }

    const response = await originalFetch(resource, config);

    return response;
  };
})();
```

Lembrando que esse código não é recomendado para uso em produção. Existem outros métodos de enviar headers sem fazer monkey patch em cima do `window.fetch`, que pode acabar quebrando sua aplicação se feito sem cuidado. Em caso de dúvidas, consulte a documentação relevante para seu projeto.

Com isso todas as requisições para `tools.kamuridesu.com` ou `localhost` teriam esse header com id único. Nesse exemplo ele seria gerado a cada vez que o usuário abrisse a página, mas pode ser guardado em localstorage ou em forma de cookie com data para expirar ou até mesmo cookie de sessão.

Com isso o frontend está pronto!

## Backend

Como a aplicação é fullstack (o backend e frontend são a mesma coisa), também foi preciso instrumentar o lado backend dele, ou seja, a aplicação Python + Quart. Para isso foi utilizada a dependência do DataDog (ddtrace) para criar um TraceMiddleware que conseguiria interceptar as requsições recebidas. Também foi feito um patch do `aiohttp` para que o DataDog conseguisse adicionar o header de baggage nas requsições enviadas.

```py
from ddtrace import patch
from ddtrace.contrib.asgi import TraceMiddleware
from quart import Quart

patch(aiohttp=True)
[...]
app = Quart(__name__, **opts)
app.asgi_app = TraceMiddleware(app.asgi_app)
```

O passo final nessa aplicação foi adicionar uma tracecontext,baggagevariável de ambiente, `DD_TRACE_HEADER_TAGS` com o valor "baggage:context.correlation_id" e outra `DD_TRACE_PROPAGATION_STYLE_EXTRACT` com o valor "tracecontext,baggage". Com isso o DataDog sabia exatamente qual header esperar e propagar.

## Serviços

Uma aplicação em Java/Spring cujo o único objetivo é receber e encaminhar requisições foi criada. Ela está rodando em duas rotas, `/java-dd-test` e `java-dd-test-two`. A `java-dd-test-two` recebe uma requisição e encaminha para a `java-dd-test`, que responde com `ok`.

Nessas não foi necessário fazer muita coisa; apenas instrumentação simples via java-agent e configuração das mesmas variáveis de ambiente `DD_TRACE_HEADER_TAGS` e `DD_TRACE_PROPAGATION_STYLE_EXTRACT`.

## Resultados

Com essa configuração foi possível confirmar que é possível obter uma correlação mesmo sem propagar um header. Todavia não consigo usar as informações internas do Datadog para relacionar esses spans do mesmo trace.

Já com o header temos um id único, gerado no frontend que está presente em TODAS as requisições no caminho, deixando uma trilha para seguirmos e montarmos dashboards, alertas ou cenários de testes. Com isso temos uma maior visibilidade a qualquer momento da vida de qualquer requisição, conseguindo rastrear desde a origem até o destino final.

## Pontos a considerar

No exemplo foi usado um header com o mesmo nome do trace gerado no front. Essa não é uma boa prática pois estão em contextos diferentes. Enquanto o valor dessa tag nos eventos do front será `@context.correlation_id:12345`, no front ela será `@context.correlation_id:correlation_id=12345`, já que o valor pego é o valor do header `baggage` e não do id em si. Esse é um comportamento já conhecido desse header.

De preferencia, utilize um outro nome na hora de traduzir esse header para spans no DataDog. Isso pode ser feito a partir da mesma variável de ambiente `DD_TRACE_HEADER_TAGS`, basta usar como valor algo como "baggage:context.correlation_id_baggage", assim a tag seria `@context.correlation_id_baggage:correlation_id=12345`, distinguindo ele da tag no RUM.

## Exemplo de dashboard

Vamos criar um dashboard simples só para ver se conseguimos pegar dados tanto do frontend quanto do backend utilizando o mesmo id.

Primeiro, criamos uma variável "correlation_id", que pega dados da tag `@context.correlation_id` do front. Depois criamos dois widgets do tipo `List`, um para RUM e outro para APM.

No primeiro widget selecionamos a origem dos dados que vamos usar, basta escolher RUM e na query adicionar `$correlation_id`. Com isso já podemos ver eventos de RUM relacionados ao id selecionado na variável.

No segundo widget, selecione Spans e coloque a query "@context.correlation_id:\*$correlation_id.value". Também já devemos poder ver informações relacionadas aos spans contendo o id selecionado. Lembrando que @context.correlation_id deve bater com o valor configurado na variável de ambiente `DD_TRACE_HEADER_TAGS`.

E pronto, basta escolher um ID para ver os dados.

![Exemplo de dashboard](https://github.com/kamuridesu/sblob/blob/main/static/images/2025-12-19-datadog-dashboard.png?raw=true)

## FAQ

### Por que usar `baggage` e não um header customizado?

Como `baggage` é um header conhecido e padronizado pelo W3C, ele é propagado de forma automatica tanto pelo DataDog quanto por outras ferramentas como service meshes (por exemplo Istio, Linkerd) ou API Gateways (como Apigee, Sensedia). Se um header customizado fosse usado, essas ferramentas não iriam propagar ele para outros serviços.

### Quais dados podem ser adicionados ao baggage?

Você pode adicionar qualquer dado, desde que respeite o limite do tamanho do header como especificado no W3C. Mas tenha em mente que as leis de proteção de dado se aplicam, esses dados ficariam registrados em logs de load balancers, proxies, provedores, entre outros. Então idealmente minha recomendação seria utilizar dados opacos, como um id gerado na sessão de usuário.
