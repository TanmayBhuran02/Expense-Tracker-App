package com.example.expensetracker

import android.content.Intent
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.text.TextUtils
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import com.example.expensetracker.databinding.ActivityLoginBinding

class LoginActivity : AppCompatActivity() {

    private lateinit var euname : EditText
    private lateinit var epword : EditText
    private lateinit var esbutton : Button
    private lateinit var sredirect : TextView
    private lateinit var db: DatabaseHelper
    private lateinit var binding: ActivityLoginBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        euname = findViewById(R.id.login_username)
        epword = findViewById(R.id.login_password)
        esbutton = findViewById(R.id.login_button)
        sredirect = findViewById(R.id.signupRedirect)
        db = DatabaseHelper(this)

        binding= ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.signupRedirect.setOnClickListener{
            val intent = Intent(this, SignUpActivity::class.java)
            startActivity(intent)
        }

        esbutton.setOnClickListener{
            val eunametext =euname.text.toString()
            val epwordtext =epword.text.toString()

            if (TextUtils.isEmpty(eunametext) || TextUtils.isEmpty(epwordtext)){
                Toast.makeText(this, "Please Enter Credentials!", Toast.LENGTH_SHORT).show()
            }
            else{
                val checkuser = db.checkuser(eunametext, epwordtext)
                if (checkuser){
                    Toast.makeText(this, "Login Successful!", Toast.LENGTH_SHORT).show()
                    val intent = Intent(this, MainActivity::class.java)
                    startActivity(intent)
                }
                else{
                    Toast.makeText(this, "Login Failed", Toast.LENGTH_SHORT).show()
                }
            }
        }


    }


}