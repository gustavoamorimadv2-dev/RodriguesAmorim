// Valores em centavos evitam diferenças entre o total e a soma das parcelas.
export function centavosHonorarios(valor) {
    if (typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && Number.isSafeInteger(Math.round(valor * 100))) return Math.round(valor * 100);
    const texto = String(valor ?? '').trim().replace(/^R\$\s*/, '');
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(texto)) {
        throw new Error('Informe um valor válido em reais, como 1.500,00.');
    }
    const [inteiro, decimal = ''] = texto.replace(/\./g, '').split(',');
    const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, '0'));
    if (!Number.isSafeInteger(centavos)) throw new Error('O valor informado é muito alto.');
    return centavos;
}
export function valorHonorarios(centavos) {
    return (centavos / 100).toFixed(2).replace('.', ',');
}
export function hojeHonorarios(data = new Date()) {
    return `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;
}
function dataValida(texto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
    const data = new Date(`${texto}T12:00:00`);
    return Number.isFinite(data.getTime()) && hojeHonorarios(data) === texto;
}
function mesVencimento(inicio, meses) {
    const [ano, mes, dia] = inicio.split('-').map(Number);
    const data = new Date(ano, mes - 1 + meses, 1, 12);
    const ultimoDia = new Date(data.getFullYear(), data.getMonth()+1, 0, 12).getDate();
    data.setDate(Math.min(dia, ultimoDia));
    return hojeHonorarios(data);
}
export function gerarParcelasCrm({total, entrada = '', quantidade = '', vencimento, forma = 'avista'}, {id, hoje = hojeHonorarios()} = {}) {
    const valor = centavosHonorarios(total);
    if (valor <= 0) throw new Error('O valor dos honorários deve ser maior que zero.');
    if (!dataValida(vencimento)) throw new Error('Informe um vencimento válido.');
    if (!id) throw new Error('Não foi possível identificar o lançamento. Tente novamente.');
    const parcela = (sufixo, nome, centavos, data) => ({
        id_parcela:`hon_${id}_${sufixo}`, parcela:nome, valor:valorHonorarios(centavos), vencimento:data, status:'Pendente'
    });
    if (forma === 'avista') return [parcela('avista', 'À Vista', valor, vencimento)];
    if (forma !== 'parcelado') throw new Error('Escolha a forma de pagamento.');
    const sinal = entrada.trim() ? centavosHonorarios(entrada) : 0;
    if (sinal >= valor) throw new Error('A entrada deve ser menor que o total. Para cobrar tudo de uma vez, escolha À vista.');
    const qtd = Number(quantidade);
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 120) throw new Error('Informe de 1 a 120 parcelas para o saldo restante.');
    const saldo = valor - sinal;
    if (saldo < qtd) throw new Error('Cada parcela deve ter pelo menos R$ 0,01.');
    if (!dataValida(hoje)) throw new Error('Data da entrada inválida.');
    const resultado = sinal ? [parcela('entrada', 'Entrada', sinal, hoje)] : [];
    for (let i = 0; i < qtd; i++) {
        const centavos = Math.floor(saldo/qtd) + (i < saldo%qtd ? 1 : 0);
        resultado.push(parcela(i, `${i+1}/${qtd}`, centavos, mesVencimento(vencimento, i)));
    }
    return resultado;
}
export function totalHonorariosCrm(parcelas) {
    return (Array.isArray(parcelas) ? parcelas : []).reduce((soma, h) => {
        try { return soma + centavosHonorarios(h.valor); } catch { return soma; }
    }, 0);
}
