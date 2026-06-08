{{/*
Expand the name of the chart.
*/}}
{{- define "aemeath.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "aemeath.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "aemeath.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "aemeath.labels" -}}
helm.sh/chart: {{ include "aemeath.chart" . }}
{{ include "aemeath.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "aemeath.selectorLabels" -}}
app.kubernetes.io/name: {{ include "aemeath.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Bot selector labels
*/}}
{{- define "aemeath.bot.selectorLabels" -}}
{{ include "aemeath.selectorLabels" . }}
app.kubernetes.io/component: bot
{{- end }}

{{/*
Worker selector labels
*/}}
{{- define "aemeath.worker.selectorLabels" -}}
{{ include "aemeath.selectorLabels" . }}
app.kubernetes.io/component: worker
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "aemeath.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "aemeath.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Image tag — defaults to Chart.appVersion
*/}}
{{- define "aemeath.imageTag" -}}
{{- default .Chart.AppVersion .Values.image.tag }}
{{- end }}

{{/*
Full image reference
*/}}
{{- define "aemeath.image" -}}
{{- printf "%s:%s" .Values.image.repository (include "aemeath.imageTag" .) }}
{{- end }}

{{/*
Secret name to use
*/}}
{{- define "aemeath.secretName" -}}
{{- if .Values.existingSecret }}
{{- .Values.existingSecret }}
{{- else }}
{{- include "aemeath.fullname" . }}
{{- end }}
{{- end }}

{{/*
ConfigMap name
*/}}
{{- define "aemeath.configMapName" -}}
{{- include "aemeath.fullname" . }}
{{- end }}
