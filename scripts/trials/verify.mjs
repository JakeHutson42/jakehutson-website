import { verifyCourse, VERIFIER_VERSION } from '../../games/trials/course-verifier.js';
import { pathToFileURL } from 'node:url';
export { verifyCourse };
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
    try {let chunks=[],bytes=0;for await(const c of process.stdin){bytes+=c.length;if(bytes>2000000)throw Error('input exceeds 2 MB');chunks.push(c);}
        const request=JSON.parse(Buffer.concat(chunks));if(request.protocol!==1)throw Error('unsupported verifier protocol');
        process.stdout.write(JSON.stringify({protocol:1,...verifyCourse(request.bike,request.course,request.budget)})+'\n');
    }catch(error){process.stdout.write(JSON.stringify({protocol:1,version:VERIFIER_VERSION,status:'error',reason:error.message})+'\n');process.exitCode=1;}
}
