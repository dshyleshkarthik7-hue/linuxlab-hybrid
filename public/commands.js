const list = document.querySelector('#list');
const search = document.querySelector('#search');
const category = document.querySelector('#category');
const count = document.querySelector('#count');

const COMMANDS = [
  ['pwd','navigation'],['ls','navigation'],['cd','navigation'],['tree','navigation'],['dirs','navigation'],['pushd','navigation'],['popd','navigation'],['realpath','navigation'],['basename','navigation'],['dirname','navigation'],
  ['touch','files'],['cat','files'],['cp','files'],['mv','files'],['rm','files'],['mkdir','files'],['rmdir','files'],['ln','files'],['readlink','files'],['file','files'],['stat','files'],['truncate','files'],['install','files'],['mktemp','files'],['shred','files'],
  ['head','text'],['tail','text'],['less','text'],['more','text'],['nl','text'],['wc','text'],['cut','text'],['paste','text'],['join','text'],['expand','text'],['unexpand','text'],['fold','text'],['fmt','text'],['column','text'],['tr','text'],['rev','text'],['sort','text'],['uniq','text'],['comm','text'],['diff','text'],['cmp','text'],['strings','text'],
  ['grep','search'],['egrep','search'],['fgrep','search'],['find','search'],['locate','search'],['which','search'],['whereis','search'],['xargs','search'],['awk','search'],['sed','search'],['rg','search'],
  ['echo','shell'],['printf','shell'],['true','shell'],['false','shell'],['test','shell'],['alias','shell'],['unalias','shell'],['history','shell'],['help','shell'],['type','shell'],['command','shell'],['builtin','shell'],['source','shell'],['read','shell'],['set','shell'],['unset','shell'],['export','shell'],['env','shell'],['printenv','shell'],['getopts','shell'],['shift','shell'],['wait','shell'],['exec','shell'],['eval','shell'],['jobs','shell'],['fg','shell'],['bg','shell'],['disown','shell'],['seq','shell'],
  ['umask','permissions'],['chmod','permissions'],['chown','permissions'],['chgrp','permissions'],['getfacl','permissions'],['setfacl','permissions'],['lsattr','permissions'],['chattr','permissions'],
  ['id','users'],['whoami','users'],['groups','users'],['who','users'],['w','users'],['users','users'],['last','users'],['lastlog','users'],['getent','users'],['passwd','users'],
  ['ps','processes'],['top','processes'],['htop','processes'],['pgrep','processes'],['pkill','processes'],['kill','processes'],['killall','processes'],['nice','processes'],['renice','processes'],['nohup','processes'],['time','processes'],['strace','processes'],['lsof','processes'],['pstree','processes'],['pidof','processes'],
  ['free','system'],['uname','system'],['hostname','system'],['uptime','system'],['dmesg','system'],['sysctl','system'],['lsb_release','system'],['arch','system'],['nproc','system'],['lscpu','system'],['lsmem','system'],
  ['lsblk','storage'],['blkid','storage'],['df','storage'],['du','storage'],['mount','storage'],['umount','storage'],['fdisk','storage'],['parted','storage'],['dd','storage'],['sync','storage'],['fsck','storage'],['mkfs','storage'],
  ['tar','archives'],['gzip','archives'],['gunzip','archives'],['bzip2','archives'],['bunzip2','archives'],['xz','archives'],['unxz','archives'],['zip','archives'],['unzip','archives'],['zcat','archives'],['ar','archives'],
  ['ip','network'],['ifconfig','network'],['ping','network'],['ss','network'],['netstat','network'],['route','network'],['arp','network'],['dig','network'],['nslookup','network'],['host','network'],['curl','network'],['wget','network'],['ssh','network'],['scp','network'],['sftp','network'],['nc','network'],['telnet','network'],['traceroute','network'],['mtr','network'],
  ['git','development'],['gcc','development'],['g++','development'],['make','development'],['cmake','development'],['python3','development'],['node','development'],['javac','development'],['java','development'],['go','development'],['rustc','development'],
  ['apk','packages'],['apt','packages'],['apt-get','packages'],['dnf','packages'],['yum','packages'],['pacman','packages'],['rpm','packages'],['dpkg','packages'],['snap','packages'],['flatpak','packages'],
  ['systemctl','services'],['service','services'],['journalctl','services'],['crontab','services'],['at','services'],['logger','services']
];

const DEDICATED_LESSONS = new Set(['pwd','ls','cd','mkdir','cat','cp','mv','rm','grep','find','sed','awk','chmod','chown','ps','top','df','du','tar','curl','ssh','ip','ping','git','head','tail']);

if (category) {
  for (const value of [...new Set(COMMANDS.map(([, group]) => group))]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value[0].toUpperCase() + value.slice(1);
    category.appendChild(option);
  }
}

function render() {
  if (!list) return;
  const q = (search?.value || '').toLowerCase().trim();
  const selected = category?.value || '';
  const filtered = COMMANDS.filter(([name, group]) => (!q || name.includes(q)) && (!selected || group === selected));
  list.replaceChildren();
  for (const [name, group] of filtered) {
    const card = document.createElement('article');
    card.className = 'card command-card';
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = group.toUpperCase();
    const title = document.createElement('h2');
    const code = document.createElement('code');
    code.textContent = name;
    title.appendChild(code);
    const demo = document.createElement('pre');
    demo.className = 'command-demo';
    const demoCode = document.createElement('code');
    const demoText = (window.LINUX_COMMAND_DEMOS && window.LINUX_COMMAND_DEMOS[name]) || name;
    demoCode.textContent = `$ ${demoText}`;
    demo.appendChild(demoCode);
    const desc = document.createElement('p');
    desc.className = 'muted';
    desc.textContent = DEDICATED_LESSONS.has(name)
      ? `Dedicated LinuxTerminal.me lesson for ${name}. Learn the concept, syntax, process flow and safe practice.`
      : `LinuxTerminal.me 200-command reference entry for ${name}. Practice the command safely from the beginner page.`;
    const link = document.createElement('a');
    link.className = 'cta';
    link.href = DEDICATED_LESSONS.has(name) ? `/commands/${encodeURIComponent(name)}.html` : '/beginner/#commands';
    link.textContent = DEDICATED_LESSONS.has(name) ? 'Open dedicated lesson →' : 'Open beginner reference →';
    card.append(pill, title, demo, desc, link);
    list.appendChild(card);
  }
  if (count) count.textContent = `${filtered.length} of ${COMMANDS.length} commands`;
}

search?.addEventListener('input', render);
category?.addEventListener('change', render);
render();
