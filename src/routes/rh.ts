// src/routes/rh.ts — Módulo RH: funcionários, ponto, espelho, folha
import { Router } from 'express';
import { q1, qAll, qRun, qInsert } from '../db';
import { uploadFotoFunc, checkMagicBytes } from '../middleware';

const TZ = 'America/Sao_Paulo';

export function createRhRouter() {
  const router = Router();


  // ── Funcionários CRUD ─────────────────────────────────────────────────────
  router.get('/', async (req: any, res) => {
    try { res.json(await qAll('SELECT * FROM funcionarios WHERE tenant_id=? ORDER BY nome ASC', [req.tenantId])); }
    catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/', async (req: any, res) => {
    try {
      const { nome,cargo,salario_base,horario_entrada,horario_saida,carga_horaria,dias_semana,tolerancia_minutos,dias_trabalho_mes,data_admissao,telefone,cpf,pin,foto_url } = req.body;
      if (!nome) return res.status(400).json({ error:'Nome obrigatório' });
      const id = await qInsert(
        'INSERT INTO funcionarios (tenant_id,nome,cargo,salario_base,horario_entrada,horario_saida,carga_horaria,dias_semana,tolerancia_minutos,dias_trabalho_mes,data_admissao,telefone,cpf,pin,foto_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [req.tenantId,nome,cargo||'',salario_base||0,horario_entrada||'08:00',horario_saida||'17:00',carga_horaria||8,dias_semana||'1,2,3,4,5',tolerancia_minutos||10,dias_trabalho_mes||26,data_admissao||null,telefone||null,cpf||null,pin||null,foto_url||null]
      );
      res.json({ id });
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.put('/:id', async (req: any, res) => {
    try {
      const { nome,cargo,salario_base,horario_entrada,horario_saida,carga_horaria,dias_semana,tolerancia_minutos,dias_trabalho_mes,data_admissao,telefone,cpf,pin,foto_url } = req.body;
      await qRun(
        'UPDATE funcionarios SET nome=?,cargo=?,salario_base=?,horario_entrada=?,horario_saida=?,carga_horaria=?,dias_semana=?,tolerancia_minutos=?,dias_trabalho_mes=?,data_admissao=?,telefone=?,cpf=?,pin=?,foto_url=? WHERE id=? AND tenant_id=?',
        [nome,cargo||'',salario_base||0,horario_entrada||'08:00',horario_saida||'17:00',carga_horaria||8,dias_semana||'1,2,3,4,5',tolerancia_minutos||10,dias_trabalho_mes||26,data_admissao||null,telefone||null,cpf||null,pin||null,foto_url||null,req.params.id,req.tenantId]
      );
      res.json({ success:true });
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.patch('/:id/desativar', async (req: any, res) => {
    try {
      await qRun("UPDATE funcionarios SET status='inativo' WHERE id=? AND tenant_id=?", [req.params.id,req.tenantId]);
      res.json({success:true});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/:id/foto', uploadFotoFunc.single('foto'), checkMagicBytes, async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      const foto_url = `/uploads/funcionarios/${req.file.filename}`;
      await qRun('UPDATE funcionarios SET foto_url=? WHERE id=? AND tenant_id=?', [foto_url, req.params.id, req.tenantId]);
      res.json({ success: true, foto_url });
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Pontos ────────────────────────────────────────────────────────────────
  router.get('/:id/pontos', async (req: any, res) => {
    try {
      const { month, year } = req.query;
      let q = 'SELECT * FROM func_pontos WHERE funcionario_id=? AND tenant_id=?';
      const p: any[] = [req.params.id, req.tenantId];
      if (month&&year) {
        q += ` AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=?`;
        p.push(String(month).padStart(2,'0'), String(year));
      }
      res.json(await qAll(q+' ORDER BY data ASC, hora ASC', p));
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/:id/pontos', async (req: any, res) => {
    try {
      const now = new Date();
      const data = now.toLocaleDateString('en-CA',{timeZone:TZ});
      const hora = now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:TZ});
      const hoje = await qAll('SELECT tipo FROM func_pontos WHERE funcionario_id=? AND tenant_id=? AND data=? ORDER BY id ASC', [req.params.id,req.tenantId,data]);
      const temEntrada = hoje.some((p:any)=>p.tipo==='entrada');
      const temSaida   = hoje.some((p:any)=>p.tipo==='saida');
      if (temEntrada&&temSaida) return res.status(409).json({success:false,error:'Ponto de entrada e saída já registrados hoje.'});
      const tipo = temEntrada ? 'saida' : 'entrada';
      const ip = (req.headers['x-forwarded-for'] as string||req.socket?.remoteAddress||'').toString();
      await qRun('INSERT INTO func_pontos (tenant_id,funcionario_id,data,hora,tipo,ip,user_agent) VALUES (?,?,?,?,?,?,?)',
        [req.tenantId,req.params.id,data,hora,tipo,ip,req.headers['user-agent']||'']);
      res.json({success:true,tipo,data,hora});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.get('/:id/pontos-dia', async (req: any, res) => {
    try {
      const { data } = req.query;
      if (!data) return res.status(400).json({ error:'data obrigatória' });
      res.json(await qAll('SELECT * FROM func_pontos WHERE funcionario_id=? AND tenant_id=? AND data=? ORDER BY id ASC', [req.params.id,req.tenantId,data]));
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/:id/pontos-manual', async (req: any, res) => {
    try {
      const { data, hora, tipo } = req.body;
      if (!data||!hora||!tipo) return res.status(400).json({ error:'data, hora e tipo obrigatórios' });
      await qRun('INSERT INTO func_pontos (tenant_id,funcionario_id,data,hora,tipo,ip) VALUES (?,?,?,?,?,?)',
        [req.tenantId,req.params.id,data,hora,tipo,'manual-admin']);
      res.json({success:true});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Pontos admin (/pontos/:id) ────────────────────────────────────────────
  router.put('/pontos/:pontId', async (req: any, res) => {
    try {
      const { hora, tipo } = req.body;
      if (!hora) return res.status(400).json({ error:'hora obrigatória' });
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(hora)) return res.status(400).json({ error:'Formato inválido. Use HH:MM' });
      const p = await q1('SELECT * FROM func_pontos WHERE id=? AND tenant_id=?', [req.params.pontId,req.tenantId]);
      if (!p) return res.status(404).json({ error:'Registro não encontrado' });
      const novaHora = hora.length===5 ? hora+':00' : hora;
      const novoTipo = tipo&&['entrada','saida'].includes(tipo) ? tipo : p.tipo;
      await qRun('UPDATE func_pontos SET hora=?,tipo=? WHERE id=? AND tenant_id=?', [novaHora,novoTipo,req.params.pontId,req.tenantId]);
      res.json({success:true});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.delete('/pontos/:pontId', async (req: any, res) => {
    try {
      if (!await q1('SELECT id FROM func_pontos WHERE id=? AND tenant_id=?', [req.params.pontId,req.tenantId]))
        return res.status(404).json({ error:'Registro não encontrado' });
      await qRun('DELETE FROM func_pontos WHERE id=? AND tenant_id=?', [req.params.pontId,req.tenantId]);
      res.json({success:true});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Horas extras ──────────────────────────────────────────────────────────
  router.get('/:id/horas-extras', async (req: any, res) => {
    try {
      const { month, year } = req.query;
      let q = 'SELECT * FROM func_horas_extras WHERE funcionario_id=? AND tenant_id=?';
      const p: any[] = [req.params.id, req.tenantId];
      if (month&&year) { q+=` AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=?`; p.push(String(month).padStart(2,'0'),String(year)); }
      res.json(await qAll(q+' ORDER BY data ASC', p));
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/:id/horas-extras', async (req: any, res) => {
    try {
      const { data, minutos, observacao } = req.body;
      if (!data||!minutos) return res.status(400).json({ error:'data e minutos obrigatórios' });
      const id = await qInsert('INSERT INTO func_horas_extras (tenant_id,funcionario_id,data,minutos,observacao) VALUES (?,?,?,?,?)',
        [req.tenantId,req.params.id,data,minutos,observacao||null]);
      res.json({success:true,id});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.delete('/horas-extras/:id', async (req: any, res) => {
    try {
      await qRun('DELETE FROM func_horas_extras WHERE id=? AND tenant_id=?', [req.params.id,req.tenantId]);
      res.json({success:true});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Eventos (falta/folga/atestado) ────────────────────────────────────────
  router.get('/:id/eventos', async (req: any, res) => {
    try {
      const { month, year } = req.query;
      let q = 'SELECT * FROM func_eventos WHERE funcionario_id=? AND tenant_id=?';
      const p: any[] = [req.params.id, req.tenantId];
      if (month&&year) { q+=` AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=?`; p.push(String(month).padStart(2,'0'),String(year)); }
      res.json(await qAll(q+' ORDER BY data ASC', p));
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/:id/eventos', async (req: any, res) => {
    try {
      const { data, tipo, horas_ausentes, observacao } = req.body;
      if (!data||!tipo) return res.status(400).json({ error:'data e tipo obrigatórios' });
      const id = await qInsert('INSERT INTO func_eventos (tenant_id,funcionario_id,data,tipo,horas_ausentes,observacao) VALUES (?,?,?,?,?,?)',
        [req.tenantId,req.params.id,data,tipo,horas_ausentes||0,observacao||null]);
      res.json({success:true,id});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.delete('/eventos/:id', async (req: any, res) => {
    try {
      await qRun('DELETE FROM func_eventos WHERE id=? AND tenant_id=?', [req.params.id,req.tenantId]);
      res.json({success:true});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Adiantamentos ─────────────────────────────────────────────────────────
  router.get('/:id/adiantamentos', async (req: any, res) => {
    try {
      res.json(await qAll('SELECT * FROM func_adiantamentos WHERE funcionario_id=? AND tenant_id=? ORDER BY data DESC', [req.params.id,req.tenantId]));
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/:id/adiantamentos', async (req: any, res) => {
    try {
      const { valor, motivo } = req.body;
      if (!valor) return res.status(400).json({ error:'valor obrigatório' });
      const id = await qInsert('INSERT INTO func_adiantamentos (tenant_id,funcionario_id,valor,motivo) VALUES (?,?,?,?)',
        [req.tenantId,req.params.id,valor,motivo||null]);
      res.json({success:true,id});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.patch('/adiantamentos/:id/descontar', async (req: any, res) => {
    try {
      await qRun('UPDATE func_adiantamentos SET descontado=1 WHERE id=? AND tenant_id=?', [req.params.id,req.tenantId]);
      res.json({success:true});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Ajustes salariais ─────────────────────────────────────────────────────
  router.get('/:id/ajustes', async (req: any, res) => {
    try {
      res.json(await qAll('SELECT * FROM func_ajustes_salario WHERE funcionario_id=? AND tenant_id=? ORDER BY data DESC', [req.params.id,req.tenantId]));
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  router.post('/:id/ajustes', async (req: any, res) => {
    try {
      const { tipo, valor, motivo } = req.body;
      if (!tipo||!valor) return res.status(400).json({ error:'tipo e valor obrigatórios' });
      const id = await qInsert('INSERT INTO func_ajustes_salario (tenant_id,funcionario_id,tipo,valor,motivo) VALUES (?,?,?,?,?)',
        [req.tenantId,req.params.id,tipo,valor,motivo||null]);
      res.json({success:true,id});
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

// ── Espelho de ponto (cálculo mensal) ─────────────────────────────────────
  router.get('/:id/espelho', async (req: any, res) => {
    try {
      const func = await q1('SELECT * FROM funcionarios WHERE id=? AND tenant_id=?', [req.params.id,req.tenantId]);
      if (!func) return res.status(404).json({ error:'Funcionário não encontrado' });
      const mm = String(req.query.month||new Date().getMonth()+1).padStart(2,'0');
      const yy = String(req.query.year||new Date().getFullYear());
      const hoje = new Date().toLocaleDateString('en-CA',{timeZone:TZ});
      const admissao = func.data_admissao||null;

      const pontos = await qAll(
        `SELECT * FROM func_pontos WHERE funcionario_id=? AND tenant_id=? AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=? ORDER BY data,hora`,
        [func.id,req.tenantId,mm,yy]
      );
      const eventos = await qAll(
        `SELECT * FROM func_eventos WHERE funcionario_id=? AND tenant_id=? AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=? ORDER BY data`,
        [func.id,req.tenantId,mm,yy]
      );
      // NOVO: Buscar também as horas extras do mês
      const extras = await qAll(
        `SELECT * FROM func_horas_extras WHERE funcionario_id=? AND tenant_id=? AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=?`,
        [func.id,req.tenantId,mm,yy]
      );

      const pbd: Record<string,any[]>={}, ebd: Record<string,any[]>={}, hbd: Record<string,any>={};
      for (const p of pontos) { if(!pbd[p.data])pbd[p.data]=[]; pbd[p.data].push(p); }
      for (const e of eventos) { if(!ebd[e.data])ebd[e.data]=[]; ebd[e.data].push(e); }
      // NOVO: Agrupar horas extras por dia
      for (const h of extras) { hbd[h.data]=h; }

      const diasNoMes = new Date(Number(yy),Number(mm),0).getDate();
      const diasSemana = (func.dias_semana||'1,2,3,4,5').split(',').map(Number);
      const tolerancia = func.tolerancia_minutos||10;
      const cargaHoras = func.carga_horaria||8;
      const horEnt = func.horario_entrada||'08:00';
      let totalFaltas=0,totalAtrasos=0,diasTrab=0,diasFolga=0,diasAtestado=0;
      let totalExtraMin=0; // NOVO: Somador de horas extras totais

      const dias: any[] = [];
      for (let d=1;d<=diasNoMes;d++) {
        const dataStr=`${yy}-${mm}-${String(d).padStart(2,'0')}`;
        const diaSem=new Date(dataStr+'T12:00:00').getDay();
        const isExp=diasSemana.includes(diaSem);
        const evts=ebd[dataStr]||[];
        const pts=pbd[dataStr]||[];
        const extraAprov=hbd[dataStr]||null; // NOVO: Pega a hora extra se existir neste dia
        
        const ent=pts.find((p:any)=>p.tipo==='entrada');
        const said=pts.find((p:any)=>p.tipo==='saida');
        let status='sem_expediente'; let atrasoMin=0;
        const isFut=dataStr>hoje;
        const isAnt=admissao&&dataStr<admissao;

        if (extraAprov) totalExtraMin += extraAprov.minutos; // Soma as horas pro resumo

        if (isFut||isAnt) { status='sem_expediente'; }
        else if (evts.some((e:any)=>e.tipo==='folga')) { status='folga'; diasFolga++; }
        else if (evts.some((e:any)=>e.tipo==='atestado')) { status='atestado'; diasAtestado++; }
        else if (isExp) {
          if (ent) {
            status='trabalhado'; diasTrab++;
            const [eh,em]=horEnt.split(':').map(Number);
            const lim=eh*60+em+tolerancia;
            const [rh,rm]=ent.hora.split(':').map(Number);
            const entMin=rh*60+rm;
            if (entMin>lim) { atrasoMin=entMin-(eh*60+em); totalAtrasos+=atrasoMin; }
          } else { status='falta'; totalFaltas++; }
        }
        // NOVO: Passa a variável 'extraAprov' para a lista de dias
        dias.push({data:dataStr,dia:d,diaSemana:diaSem,isExpediente:isExp&&!isFut&&!isAnt,status,entrada:ent?.hora,saida:said?.hora,atrasoMin,eventos:evts,extraAprov});
      }
      const valorDia=func.salario_base/(func.dias_trabalho_mes||26);
      const valorHora=valorDia/cargaHoras;
      
      // NOVO: Adiciona 'totalExtraMin' no resumo final
      res.json({ func, dias, resumo:{diasTrabalhados:diasTrab,totalFaltas,diasFolga,diasAtestado,totalAtrasoMin:totalAtrasos,totalExtraMin,descontoFaltas:totalFaltas*valorDia,descontoAtrasos:(totalAtrasos/60)*valorHora,totalDescontos:(totalFaltas*valorDia)+((totalAtrasos/60)*valorHora)} });
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  // ── Folha de pagamento ────────────────────────────────────────────────────
  router.get('/:id/folha', async (req: any, res) => {
    try {
      const func = await q1('SELECT * FROM funcionarios WHERE id=? AND tenant_id=?', [req.params.id,req.tenantId]);
      if (!func) return res.status(404).json({ error:'Funcionário não encontrado' });
      
      const mm = String(req.query.month||new Date().getMonth()+1).padStart(2,'0');
      const yy = String(req.query.year||new Date().getFullYear());
      const hoje = new Date().toLocaleDateString('en-CA',{timeZone:TZ});
      const admissao = func.data_admissao||null;

      // Busca todos os dados do mês
      const pontos = await qAll(`SELECT * FROM func_pontos WHERE funcionario_id=? AND tenant_id=? AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=?`, [func.id,req.tenantId,mm,yy]);
      const eventos = await qAll(`SELECT * FROM func_eventos WHERE funcionario_id=? AND tenant_id=? AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=?`, [func.id,req.tenantId,mm,yy]);
      const extras = await qAll(`SELECT * FROM func_horas_extras WHERE funcionario_id=? AND tenant_id=? AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=?`, [func.id,req.tenantId,mm,yy]);
      const adiantamentos = await qAll(`SELECT * FROM func_adiantamentos WHERE funcionario_id=? AND tenant_id=? AND descontado=0 AND TO_CHAR(data::date,'MM')=? AND TO_CHAR(data::date,'YYYY')=?`, [func.id,req.tenantId,mm,yy]);

      const pbd: Record<string,any[]>={}, ebd: Record<string,any[]>={};
      for (const p of pontos) { if(!pbd[p.data])pbd[p.data]=[]; pbd[p.data].push(p); }
      for (const e of eventos) { if(!ebd[e.data])ebd[e.data]=[]; ebd[e.data].push(e); }

      const diasNoMes = new Date(Number(yy),Number(mm),0).getDate();
      const diasSemana = (func.dias_semana||'1,2,3,4,5').split(',').map(Number);
      const tolerancia = func.tolerancia_minutos||10;
      const cargaHoras = func.carga_horaria||8;
      const horEnt = func.horario_entrada||'08:00';

      let totalFaltas=0, totalAtrasos=0, horasAusentesParcial=0;
      let totalExtraMin = extras.reduce((acc, curr) => acc + (curr.minutos||0), 0);
      let totalAdiantamentos = adiantamentos.reduce((acc, curr) => acc + (Number(curr.valor)||0), 0);

      // Loop para varrer os dias do mês e contar faltas/atrasos
      for (let d=1;d<=diasNoMes;d++) {
        const dataStr=`${yy}-${mm}-${String(d).padStart(2,'0')}`;
        const diaSem=new Date(dataStr+'T12:00:00').getDay();
        const isExp=diasSemana.includes(diaSem);
        const evts=ebd[dataStr]||[];
        const pts=pbd[dataStr]||[];
        const isFut=dataStr>hoje;
        const isAnt=admissao&&dataStr<admissao;

        const parcial = evts.find((e:any)=>e.tipo==='declaracao_parcial');
        if(parcial) horasAusentesParcial += (Number(parcial.horas_ausentes)||0);

        if (!isFut && !isAnt && isExp && !evts.some((e:any)=>['folga','atestado'].includes(e.tipo))) {
          const ent=pts.find((p:any)=>p.tipo==='entrada');
          if (ent) {
            const [eh,em]=horEnt.split(':').map(Number);
            const lim=eh*60+em+tolerancia;
            const [rh,rm]=ent.hora.split(':').map(Number);
            const entMin=rh*60+rm;
            if (entMin>lim) totalAtrasos+=(entMin-(eh*60+em));
          } else {
            totalFaltas++;
          }
        }
      }

      // Cálculos Financeiros
      const salarioBruto = Number(func.salario_base) || 0;
      const valorDia = salarioBruto / (func.dias_trabalho_mes || 26);
      const valorHora = valorDia / cargaHoras;

      const descontoFaltas = totalFaltas * valorDia;
      const descontoAtrasos = (totalAtrasos / 60) * valorHora;
      const descontoParcial = horasAusentesParcial * valorHora;
      const valorExtras = (totalExtraMin / 60) * (valorHora * 1.5); // Adicional de 50% CLT

      const inss = salarioBruto * 0.11; // 11% estimado

      const totalDescontos = descontoFaltas + descontoAtrasos + descontoParcial + inss + totalAdiantamentos;
      const salarioLiquido = salarioBruto + valorExtras - totalDescontos;

      // Envia a estrutura exata que o Front-end espera
      res.json({
        funcionario: func,
        mes: `${mm}/${yy}`,
        salarioBruto,
        totalFaltas,
        descontoFaltas,
        totalAtrasoMin: totalAtrasos,
        descontoAtrasos,
        horasAusentesParcial,
        descontoParcial,
        inss,
        totalAdiantamentos,
        adiantamentos,
        totalExtraMin,
        valorExtras,
        totalDescontos,
        salarioLiquido
      });
    } catch(e: any) { res.status(500).json({ error:e.message }); }
  });

  return router;
}