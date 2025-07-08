# Integrando DataDog e Kubernetes

DataDog é uma plataforma de observabilidade com um ecossistema grande e complexo, com mais de 850 integrações embutidas. É um sistema poderoso, mas que rapidamente pode se tornar confuso. Este artigo serve como um guia inicial de como configurar o DataDog em um cluster Kubernetes via Helm, como realizar a auto instrumentação de projetos em Python e Java e como instrumentar aplicações em Go.

## Requisitos

Para acompanhar este artigo, é necessário conhecimento prévio de git, Helm e Kubernetes.

## Configuração do DataDog

A configuração do DataDog é feita a partir de um arquivo de Values usado pelo chart Helm. O arquivo de Values contém campos com valores que serão usados pelo DataDog na hora da criação de recursos como Agents dentro do Kubernetes.

### Configurando a chave de API

O primeiro passo é criar uma `secret` contendo a chave de API do DataDog. Ela deverá ter um campo com a chave `api-key` e o valor da sua chave.

Para a criação da secret, você pode usar o seguinte comando:

```
export DATADOG_API_SECRET_NAME=datadog-api-secret
kubectl create secret generic $DATADOG_API_SECRET_NAME --from-literal api-key="<SUA_CHAVE_DE_API>"
```

### Criando o arquivo de Values

Com a secret configurada, podemos iniciar a criação do arquivo de Values. Abaixo está a configuração que uso em meu cluster.

```yaml
datadog:
  apiKeyExistingSecret: datadog-api-secret # O nome da secret criada anteriormente
  site: us5.datadoghq.com # O seu site do datadog
  clusterName: k3s-test # O nome do seu cluster

  clusterChecks:
    # Habilita a checagem de cluster usando agents em cada nó
    enabled: true

  clusterAgent:
    # Habilita agents que rodam em cada nó para descobrir serviços e dispachar checagens
    enabled: true

  clusterChecksRunner:
    # Faz a checagem usando uma coleção pequena de agents para rodar as checagens
    enabled: true

  # container view: https://docs.datadoghq.com/infrastructure/containers/?tab=docker
  containerExclude: "kube_namespace:haproxy-ingress"
  containerExcludeLogs: "kube_namespace:haproxy-ingress"
  containerExcludeMetrics: "kube_namespace:haproxy-ingress"

  logLevel: WARN
  logs:
    # Desativa coleta de logs
    containerCollectAll: false
    containerCollectUsingFiles: false

  containerImageCollection:
    # Não coletar informações de imagens
    enabled: false

  kubelet:
    # Não verificar certificados dos kubelet nos nós
    tlsVerify: false

  otlp:
    # Habilita a integração com OpenTelemetry
    receiver:
      protocols:
        grcp:
          enabled: true
        http:
          enabled: true

  apm:
    # Configura a integração para coleta de métricas de aplicações
    enabled: true
    instrumentation:
      # Habilita a instrumentação de aplicações de forma automatica
      enabled: true
      targets:
        # Configura a injeção de telemetria em projetos com o label "language: python"
        - name: "python-projects"
          podSelector:
            matchLabels:
              language: python
          ddTraceVersions:
            python: "3"
        # Configura a injeção de telemetria em projetos com o label "language: java"
        - name: "java-projects"
          podSelector:
            matchLabels:
              language: java
          ddTraceVersions:
            java: "default"
          ddTraceConfigs:
            - name: "DD_PROFILING_ENABLED"
              value: "auto"
```

O arquivo acima está bem comentado de forma a garantir clareza na explicação. Mas vamos olhar ele mais a fundo:

#### Configurando cluster

Na primeira seção definimos o campo `datadog:`, que é onde será feita toda a configuração. No início dessa seção vamos apontar para a secret contendo a chave de API que criamos anteriormente. Também vamos popular os campos de site e clusterName (nome do cluster), com o seu site e o nome do seu cluster.

Abaixo é possível ver as configurações de Cluster Checks. Cluster checks são mecanismos para a configuração dos Agents do DataDog que irão fazer a auto descoberta dos containers e configurações do seu cluster.

Logo após desativamos a coleta de métrica para o controller ingress do HAProxy, que é o que uso em meu cluster, além de desativar a coleta de logs, verificação de certificado do Kubelet e coleta de informações sobre imagens.

Também é habilitada a integração com o OpenTelemetry para facilitar a integração com outros serviços.

#### Configurando APM para auto instrumentação

Na seção de APM temos a configuração de auto instrumentação de aplicações Java e Python. Habilitamos a instrumentação e configuramos os alvos, dando um nome e usando selectors para fazer a injeção de código de telemetria nas aplicações com o label "language: python" ou "language: java".

A versão da biblioteca do DataDog a ser injetada também é definida nessa seção, em ddTraceConfigs.

## Usando labels do DataDog nas aplicações

Para a integração funcionar corretamente, é necessário que o pod tenha os seguintes labels:

- app.Kubernetes.io/name: o nome da aplicação
- app.Kubernetes.io/version: versão da aplicação
- tags.datadoghq.com/env: ambiente da aplicação (ex: prod, dev)
- tags.datadoghq.com/service: nome da aplicação
- tags.datadoghq.com/version: versão da aplicação
- language: a tag que definimos com a linguagem para instrumentação

Com todas as tags definidas, o DataDog já conseguirá monitorar o serviço sem problemas.

## Instrumentando aplicações Go

Em aplicações Go não podemos injetar código em runtime, ou seja, depois da aplicação ser compilada. Todavia podemos intejar ela em compile time, quer dizer, enquanto fazemos a compilação.

O DataDog tem uma ferramenta muito interessante que se chama Orchestrion. Ela injeta código de telemetria na hora da compilação e torna a integração de aplicações Go com serviços de monitoramento em um passeio no parque.

Ela instrumenta até as dependências do código sem nenhuma intervenção dos mantenedores!

### Configurando o Orchestrion

Nessa configuração, vamos incluir o Orchestrion apenas na hora do build, sem precisar meter a mão em código já existente.

Abaixo está o meu Dockerfile para um projeto pessoal, é um Dockerfile multi-step que compila uma aplicação Go, não muito complexo.

```Dockerfile
FROM golang:1.23.0-alpine AS build
ENV CGO_ENABLED=1
ENV CGO_CFLAGS="-D_LARGEFILE64_SOURCE"

RUN apk add --no-cache \
    gcc \
    musl-dev

WORKDIR /workspace

COPY go.mod go.sum ./
RUN go mod download

COPY ./*.go /workspace/
RUN go build -ldflags='-s -w -extldflags "-static"' -o "moe-count"

FROM scratch AS deploy

WORKDIR /app/
COPY --from=build /workspace/moe-count /usr/local/bin/moe-count
COPY ./static /app/static
COPY ./template /app/template

EXPOSE 8080
ENTRYPOINT [ "moe-count" ]
```

O resultado é uma imagem extremamente simples e enxuta, sem muita coisa. Acaba que também não temos como monitorar a aplicação e nenhuma telemetria para identificar erros que possam estar a contecendo.

Pra adicionar telemetria, vamos incluir o Orchestrion no Dockerfile acima:

```Dockerfile
FROM golang:1.23.0-alpine AS build
ENV CGO_ENABLED=1
ENV CGO_CFLAGS="-D_LARGEFILE64_SOURCE"

RUN apk add --no-cache \
    gcc \
    musl-dev

WORKDIR /workspace
RUN go install github.com/DataDog/orchestrion@latest

# Copy dependencies files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY ./*.go /workspace/
RUN orchestrion pin
# Builds a static trimmed binary with orchestrion injectione
RUN go build -ldflags='-s -w -extldflags "-static"' -toolexec="orchestrion toolexec" -o "moe-count"

FROM scratch AS deploy

WORKDIR /app/
COPY --from=build /workspace/moe-count /usr/local/bin/moe-count
COPY ./static /app/static
COPY ./template /app/template

ENTRYPOINT [ "moe-count" ]
```

Note que apenas 3 linhas foram alteradas:

- `RUN go install github.com/DataDog/orchestrion@latest` instala o Orchestrion na imagem base
- `RUN orchestrion pin` adiciona as dependências do Orchestrion no `go.mod`
- `RUN go build [...] -toolexec="orchestrion toolexec" [...]` injeta o código de telemetria no código e dependências.

```
Atenção: o comando `orchestrion pin` precisa que todo o código fonte esteja presente pois irá rodar o comando `go mod tidy` para refazer seu `go.mod`, o que pode acarretar em dependências deletadas caso o código fonte não seja encontrado.
```

Após isso pronto, sua nova imagem com telemetria estará pronta para uso!

## Referências

<https://github.com/kamuridesu/moe-count-go>

<https://github.com/datadog/orchestrion>

<https://docs.datadoghq.com/containers/cluster_agent/clusterchecks/?tab=helm>

<https://docs.datadoghq.com/containers/kubernetes/installation?tab=helm>

<https://docs.datadoghq.com/containers/kubernetes/apm/?tab=helm>

<https://artifacthub.io/packages/helm/datadog/datadog>
