#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
print 'Broker Finance — painel local em http://localhost:8765'
print 'Mantenha esta janela aberta enquanto usar o painel. Ctrl+C encerra o servidor.'
open 'http://localhost:8765'
python3 -m http.server 8765 --bind 127.0.0.1
